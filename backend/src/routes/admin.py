import json
import secrets
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from src.models.resume import Resume, Education
from src.models.jd_analysis import JDAnalysis, MatchResult
from src.models.user_db import User
from src.models.employee_list import CompanyEmployeeList, AppConfig
from src.models.job_application import JobApplication
from src.models.job_opening import JobOpening
from src.config.database import get_postgres_db
from src.config.settings import settings
from src.middleware.auth_middleware import get_admin_user, create_invite_token
from src.routes.auth import hash_password
from src.services.email_service import send_admin_invite_email, is_email_configured
from src.utils.logger import get_logger
from src.utils.user_type_mapper import normalize_user_type, get_user_type_from_source_type
from src.utils.response_formatter import format_resume_response

logger = get_logger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])

ALLOWED_SOURCE_TYPES = {'company_employee', 'freelancer', 'guest', 'admin', 'gmail'}


class InviteRequest(BaseModel):
    """Request to send an admin invite to a company employee."""
    email: EmailStr
    role: str  # Admin, Talent Acquisition, HR
    custom_set_password_link: Optional[str] = None  # if set, this link is used in the email instead of the generated one
    temporary_password: Optional[str] = None  # if set, this password is used instead of a generated one


class UpdateResumeTypeRequest(BaseModel):
    source_type: str
    source_id: str | None = None  # optional: current source_id for fallback lookup when id not found

@router.get("/stats")
async def get_dashboard_stats(
    user_type: Optional[str] = Query(None, description="Filter by talent category: all, Company Employee, Freelancer, Guest User, Admin Uploads"),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get dashboard statistics with breakdown by user type and upload trends (Admin only). Optional user_type filter applies to all resume-based metrics and graphs."""
    try:
        # Get PostgreSQL stats (including users)
        total_users_result = await db.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar()
        
        total_resumes_result = await db.execute(select(func.count(Resume.id)))
        total_resumes = total_resumes_result.scalar()
        
        total_jd_analyses_result = await db.execute(select(func.count(JDAnalysis.id)))
        total_jd_analyses = total_jd_analyses_result.scalar()
        
        total_matches_result = await db.execute(select(func.count(MatchResult.id)))
        total_matches = total_matches_result.scalar()
        
        # Get total education entries count
        total_education_result = await db.execute(select(func.count(Education.id)))
        total_education = total_education_result.scalar()
        
        # Platform users (Admin, HR, Talent Acquisition) count
        PLATFORM_MODES = ('admin', 'hr', 'talent_acquisition', 'talent acquisition')
        platform_users_result = await db.execute(
            select(func.count(User.id)).where(func.lower(User.mode).in_(PLATFORM_MODES))
        )
        total_platform_users = platform_users_result.scalar() or 0
        
        # Total employees from CSV (company_employee_list)
        employees_result = await db.execute(select(func.count(CompanyEmployeeList.id)))
        total_employees = employees_result.scalar() or 0
        
        # Get all resumes with formatted responses and prefetch relationships
        from sqlalchemy.orm import selectinload
        from sqlalchemy import nulls_last
        all_resumes_query = select(Resume).options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations)
        ).order_by(nulls_last(Resume.uploaded_at.desc()))
        all_resumes_result = await db.execute(all_resumes_query)
        all_resumes = all_resumes_result.scalars().all()

        # Apply user_type filter: only resume-based metrics (graphs + talent pool count) use filtered list
        filter_user_type = (user_type or "").strip() if user_type else None
        if filter_user_type and filter_user_type.lower() != "all":
            resumes_to_use = []
            for r in all_resumes:
                meta = r.meta_data or {}
                ut = normalize_user_type(meta.get("user_type") or get_user_type_from_source_type(r.source_type))
                if ut == filter_user_type:
                    resumes_to_use.append(r)
        else:
            resumes_to_use = all_resumes

        # Initialize trend data structure
        target_user_types = ['Company Employee', 'Freelancer', 'Guest User']
        
        # Helper to get normalized date/month/quarter
        def get_trend_keys(dt):
            year = dt.year
            month = dt.month
            quarter = (month - 1) // 3 + 1
            return {
                'day': dt.date().isoformat(),
                'month': f"{year}-{month:02d}",
                'quarter': f"{year}-Q{quarter}"
            }

        trends = {
            'day': {},
            'month': {},
            'quarter': {}
        }

        # Last 365 days for comprehensive trends
        one_year_ago = datetime.utcnow() - timedelta(days=365)

        # Initialize user type counts for ALL user types (not just target types)
        user_type_counts = {ut: 0 for ut in target_user_types}
        user_type_skills = {ut: {} for ut in target_user_types}
        if filter_user_type and filter_user_type not in user_type_skills:
            user_type_skills[filter_user_type] = {}
        skill_count = {}
        experience_counts = {} # Bins: 0, 1, 2, 3...
        state_distribution = {} # Maharashtra, Karnataka, etc.
        role_candidates = {} # 'Software Engineer': [{'name': '...', 'exp': ...}, ...]
        # Notice period buckets for windrose (days): Immediate, 0-15, 15-30, 30-60, 60-90, 90+
        notice_period_buckets = {
            'Immediate (0d)': 0,
            '1-15 days': 0,
            '16-30 days': 0,
            '31-60 days': 0,
            '61-90 days': 0,
            '90+ days': 0,
        }
        # Relocation: ready_to_relocate true vs false (same sources as format_resume_response)
        relocation_ready_count = 0
        relocation_not_ready_count = 0

        def _to_bool(v):
            if v is None: return False
            if isinstance(v, bool): return v
            if isinstance(v, str): return v.strip().lower() in ('1', 'true', 'yes')
            return bool(v)

        # Indian State Mapping for normalization
        STATE_MAPPING = {
            'maharashtra': 'Maharashtra', 'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra',
            'karnataka': 'Karnataka', 'bangalore': 'Karnataka', 'bengaluru': 'Karnataka', 'mysore': 'Karnataka',
            'delhi': 'Delhi', 'noida': 'Uttar Pradesh', 'gurgaon': 'Haryana', 'gurugram': 'Haryana',
            'tamil nadu': 'Tamil Nadu', 'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu',
            'telangana': 'Telangana', 'hyderabad': 'Telangana',
            'west bengal': 'West Bengal', 'kolkata': 'West Bengal',
            'gujarat': 'Gujarat', 'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat',
            'rajasthan': 'Rajasthan', 'jaipur': 'Rajasthan', 'udaipur': 'Rajasthan',
            'punjab': 'Punjab', 'chandigarh': 'Chandigarh', 'amritsar': 'Punjab',
            'haryana': 'Haryana',
            'uttar pradesh': 'Uttar Pradesh', 'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh',
            'madhya pradesh': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'bhopal': 'Madhya Pradesh',
            'kerala': 'Kerala', 'kochi': 'Kerala', 'thiruvananthapuram': 'Kerala',
            'andhra pradesh': 'Andhra Pradesh', 'visakhapatnam': 'Andhra Pradesh',
            'bihar': 'Bihar', 'patna': 'Bihar',
            'odisha': 'Odisha', 'bhubaneswar': 'Odisha',
            'assam': 'Assam', 'guwahati': 'Assam',
            'chhattisgarh': 'Chhattisgarh', 'raipur': 'Chhattisgarh',
            'jharkhand': 'Jharkhand', 'ranchi': 'Jharkhand',
            'uttarakhand': 'Uttarakhand', 'dehradun': 'Uttarakhand',
            'himachal pradesh': 'Himachal Pradesh'
        }

        for resume in resumes_to_use:
            # Normalize user type
            meta = resume.meta_data or {}
            ut = normalize_user_type(meta.get('user_type') or get_user_type_from_source_type(resume.source_type))
            
            # Count ALL user types (including Admin Uploads, Gmail Resume, etc.)
            # Initialize the count if it doesn't exist
            if ut not in user_type_counts:
                user_type_counts[ut] = 0
            user_type_counts[ut] += 1
            
            # Count skills when in target types OR when a filter is applied (so filtered view shows skills)
            if ut in target_user_types or filter_user_type:
                # Robust skill extraction
                skills_list = resume.skills or []
                if not skills_list and resume.parsed_data:
                     # fallback to parsed data
                     skills_list = resume.parsed_data.get('resume_technical_skills', []) or resume.parsed_data.get('all_skills', [])

                if skills_list:
                    if ut not in user_type_skills:
                        user_type_skills[ut] = {}
                    for skill in skills_list:
                        # Normalize skill
                        skill = skill.strip()
                        if not skill: continue
                        
                        # Add to user type breakdown
                        user_type_skills[ut][skill] = user_type_skills[ut].get(skill, 0) + 1
                        
                        # Add to global count (for dashboard top_skills chart)
                        skill_count[skill] = skill_count.get(skill, 0) + 1

            # Populate Experience Distribution
            exp = float(resume.experience_years or 0)
            exp_bin = int(exp) # Round down to nearest year
            experience_counts[exp_bin] = experience_counts.get(exp_bin, 0) + 1

            # Populate Trends (only if uploaded_at is not None)
            if resume.uploaded_at and resume.uploaded_at >= one_year_ago:
                keys = get_trend_keys(resume.uploaded_at)
                for period in ['day', 'month', 'quarter']:
                    key = keys[period]
                    if key not in trends[period]:
                        trends[period][key] = {ut: 0 for ut in target_user_types}
                        trends[period][key]['name'] = key
                    
                    if ut in target_user_types:
                        trends[period][key][ut] += 1
            
            # Map location to Indian State
            # Safe extraction: Source Metadata (Form Data) > Parsed Data
            loc_str = ""
            if resume.source_metadata and 'form_data' in resume.source_metadata:
                loc_str = resume.source_metadata['form_data'].get('location') or ""
            
            if not loc_str and resume.parsed_data:
                loc_str = resume.parsed_data.get('resume_location') or resume.parsed_data.get('location') or ""
            
            loc = str(loc_str).lower()
            found_state = None
            for key, state in STATE_MAPPING.items():
                if key in loc:
                    found_state = state
                    break
            
            if found_state:
                state_distribution[found_state] = state_distribution.get(found_state, 0) + 1
            
            # Map Roles for Circle Packing
            role_str = ""
            if resume.source_metadata and 'form_data' in resume.source_metadata:
                role_str = resume.source_metadata['form_data'].get('role') or ""
            
            if not role_str and resume.parsed_data:
                role_str = resume.parsed_data.get('resume_role') or resume.parsed_data.get('role') or ""
            
            if role_str and role_str != "Not mentioned":
                # Basic normalization: title case
                norm_role = role_str.strip().title()
                if norm_role not in role_candidates:
                    role_candidates[norm_role] = []
                
                # Correctly extract name for the tooltip preview
                cand_name = None
                if resume.source_metadata and 'form_data' in resume.source_metadata:
                    cand_name = resume.source_metadata['form_data'].get('fullName') or resume.source_metadata['form_data'].get('name')
                
                if not cand_name and resume.parsed_data:
                    p = resume.parsed_data
                    cand_name = p.get('resume_candidate_name') or p.get('candidate_name') or p.get('name') or p.get('fullName')
                
                if not cand_name or str(cand_name).lower() == "not mentioned":
                    cand_name = "Anonymous"

                role_candidates[norm_role].append({
                    'name': str(cand_name),
                    'exp': float(resume.experience_years or 0)
                })

            # Notice period (days) for windrose - same sources as format_resume_response (Records)
            # Order: form_data.noticePeriod > meta_data.notice_period > meta_data.user_profile.notice_period > parsed_data.notice_period
            notice_days = None
            if resume.source_metadata and isinstance(resume.source_metadata.get('form_data'), dict):
                notice_days = resume.source_metadata['form_data'].get('noticePeriod')
            if notice_days is None and resume.meta_data:
                notice_days = resume.meta_data.get('notice_period')
            if notice_days is None and resume.meta_data and isinstance(resume.meta_data.get('user_profile'), dict):
                notice_days = resume.meta_data['user_profile'].get('notice_period')
            if notice_days is None and resume.parsed_data:
                notice_days = resume.parsed_data.get('notice_period') or resume.parsed_data.get('noticePeriod')
            try:
                notice_days = int(notice_days) if notice_days is not None else 0
            except (TypeError, ValueError):
                notice_days = 0
            if notice_days <= 0:
                notice_period_buckets['Immediate (0d)'] += 1
            elif notice_days <= 15:
                notice_period_buckets['1-15 days'] += 1
            elif notice_days <= 30:
                notice_period_buckets['16-30 days'] += 1
            elif notice_days <= 60:
                notice_period_buckets['31-60 days'] += 1
            elif notice_days <= 90:
                notice_period_buckets['61-90 days'] += 1
            else:
                notice_period_buckets['90+ days'] += 1

        # Format trends for Recharts (sorted lists)
        formatted_trends = {
            p: sorted(trends[p].values(), key=lambda x: x['name'])
            for p in ['day', 'month', 'quarter']
        }
        
        # Only take last 30 days for 'day' to avoid bloated response, but keep full year for others
        formatted_trends['day'] = formatted_trends['day'][-30:]

        top_skills = sorted(skill_count.items(), key=lambda x: x[1], reverse=True)[:10]
        top_skills_by_user_type = {
            ut: sorted(skills_dict.items(), key=lambda x: x[1], reverse=True)[:5]
            for ut, skills_dict in user_type_skills.items()
        }

        # Get all JD analyses
        recent_jd_query = select(JDAnalysis).order_by(JDAnalysis.submitted_at.desc())
        recent_jd_result = await db.execute(recent_jd_query)
        recent_jd = recent_jd_result.scalars().all()

        # Format resumes safely, skipping any that cause errors (use filtered list for consistency)
        formatted_resumes = []
        for r in resumes_to_use:
            if r is None:
                continue
            try:
                formatted_resumes.append(format_resume_response(r))
            except Exception as resume_error:
                logger.warning(f"Failed to format resume {r.id if hasattr(r, 'id') else 'unknown'}: {resume_error}")
                # Skip this resume but continue processing others

        # Relocation counts from formatted_resumes so we match Records exactly (same format_resume_response logic)
        relocation_ready_count = sum(1 for fr in formatted_resumes if _to_bool(fr.get('ready_to_relocate', False)))
        relocation_not_ready_count = len(formatted_resumes) - relocation_ready_count

        # Total talent categories (distinct user types with data) and total distinct roles from resumes
        total_categories = len(user_type_counts) if user_type_counts else 0
        total_roles = len(role_candidates) if role_candidates else 0

        # Log the counts for debugging
        logger.info(f"Dashboard stats - Total resumes: {total_resumes}, Total users: {total_users}")
        logger.info(f"User type breakdown: {user_type_counts}")
        
        return {
            'total_users': total_users,
            'total_records': len(resumes_to_use),  # Filtered count for dashboard graphs + talent pool
            'total_resumes': len(resumes_to_use),
            'total_jd_analyses': total_jd_analyses,
            'total_matches': total_matches,
            'total_education': total_education,
            'total_categories': total_categories,
            'total_platform_users': total_platform_users,
            'total_employees': total_employees,
            'total_roles': total_roles,
            'departmentDistribution': user_type_counts, # Keep name for backwards compatibility during transition
            'user_type_breakdown': user_type_counts, # Now includes ALL user types (Admin Uploads, Gmail Resume, etc.)
            'top_skills': [{'skill': skill, 'count': count} for skill, count in top_skills],
            'top_skills_by_user_type': {
                ut: [{'skill': skill, 'count': count} for skill, count in skills_list]
                for ut, skills_list in top_skills_by_user_type.items()
            },
            'experience_distribution': sorted(
                [{'exp': exp, 'count': experience_counts.get(exp, 0)} for exp in range(0, (max(experience_counts.keys()) if experience_counts and len(experience_counts) > 0 else 0) + 1)],
                key=lambda x: x['exp']
            ) if experience_counts and len(experience_counts) > 0 else [],
            'location_distribution': [{'state': s, 'count': c} for s, c in state_distribution.items()],
            'role_distribution': sorted([
                {
                    'role': r, 
                    'count': len(cands), 
                    'candidates': sorted(cands, key=lambda x: x['exp'], reverse=True)
                } 
                for r, cands in role_candidates.items()
            ], key=lambda x: x['count'], reverse=True),
            'notice_period_distribution': [
                {'name': name, 'count': count} for name, count in notice_period_buckets.items()
            ],
            'relocation_distribution': [
                {'name': 'Ready to Relocate', 'count': relocation_ready_count},
                {'name': 'Not open to relocation', 'count': relocation_not_ready_count},
            ],
            'trends': formatted_trends,
            'recentResumes': formatted_resumes, # Renamed for frontend consistency
            'recent_jd_analyses': [
                {
                    'job_id': jd.job_id,
                    'filename': jd.jd_filename,
                    'submitted_at': jd.submitted_at.isoformat() if jd.submitted_at else None
                }
                for jd in recent_jd
            ],
            'departments': target_user_types
        }
    
    except Exception as e:
        import traceback
        logger.error(f"Get stats error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


def _parse_notification_timestamp(value):
    """Parse ISO timestamp for sorting; returns datetime.min on failure."""
    if not value:
        return datetime.min
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return datetime.min


def _resume_source_label(st):
    if not st:
        return "Upload"
    st = (st or "").lower()
    if st == "guest":
        return "Careers / Guest"
    if st == "gmail":
        return "Gmail"
    if st == "outlook":
        return "Outlook"
    if st == "company_employee":
        return "Employee portal"
    if st == "admin":
        return "Admin upload"
    if st == "freelancer":
        return "Freelancer"
    return st.replace("_", " ").title()


@router.get("/notifications")
async def get_admin_notifications(
    limit: int = Query(50, ge=1, le=100),
    days: int = Query(14, ge=1, le=30),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Recent platform activity for the admin notification panel."""
    try:
        since = datetime.utcnow() - timedelta(days=days)
        now = datetime.utcnow()
        notifications = []
        cap = limit * 2  # gather extra before sort/limit

        # 1) Resume uploads (careers, Gmail/Outlook fetch, employee/freelancer/guest, admin bulk)
        resume_query = (
            select(Resume.id, Resume.uploaded_at, Resume.source_type, Resume.filename)
            .where(Resume.uploaded_at >= since)
            .order_by(Resume.uploaded_at.desc())
            .limit(cap)
        )
        res = await db.execute(resume_query)
        rows = res.all()
        resume_ids = [r[0] for r in rows]
        job_meta_by_resume = {}
        if resume_ids:
            ja_res = await db.execute(
                select(
                    JobApplication.resume_id,
                    JobApplication.job_title,
                    JobApplication.applicant_name,
                ).where(JobApplication.resume_id.in_(resume_ids))
            )
            for ja in ja_res.all():
                job_meta_by_resume[ja[0]] = {"job_title": ja[1], "applicant_name": ja[2]}

        for r in rows:
            rid, uploaded_at, source_type, filename = r[0], r[1], r[2], r[3]
            label = _resume_source_label(source_type)
            meta = job_meta_by_resume.get(rid) or {}
            job_title = meta.get("job_title")
            applicant = (meta.get("applicant_name") or "").strip()
            file_part = f" ({filename})" if filename else ""

            if job_title:
                who = f" from {applicant}" if applicant else ""
                message = f"New job application: {job_title}{who}{file_part}"
                ntype = "job_application"
            elif (source_type or "").lower() in ("gmail", "outlook"):
                message = f"Resume fetched from {label}{file_part}"
                ntype = "email_fetch"
            else:
                message = f"New resume added via {label}{file_part}"
                ntype = "resume_upload"

            notifications.append({
                "id": f"resume-{rid}",
                "type": ntype,
                "message": message,
                "timestamp": uploaded_at.isoformat() if uploaded_at else None,
                "resume_id": rid,
                "job_title": job_title,
                "source_type": source_type,
                "filename": filename,
            })

        # 2) Job openings created / updated
        jobs_res = await db.execute(
            select(JobOpening.job_id, JobOpening.title, JobOpening.status, JobOpening.created_at, JobOpening.updated_at)
            .where(or_(JobOpening.created_at >= since, JobOpening.updated_at >= since))
            .order_by(JobOpening.updated_at.desc())
            .limit(cap)
        )
        for job in jobs_res.all():
            jid, title, status, created_at, updated_at = job
            created_at = created_at or updated_at
            updated_at = updated_at or created_at
            is_update = (
                created_at
                and updated_at
                and (updated_at - created_at).total_seconds() > 120
                and updated_at >= since
            )
            if is_update:
                notifications.append({
                    "id": f"job-updated-{jid}-{updated_at.timestamp() if updated_at else 0}",
                    "type": "job_updated",
                    "message": f"Job opening updated: {title} ({status or 'active'})",
                    "timestamp": updated_at.isoformat() if updated_at else None,
                    "job_id": jid,
                })
            elif created_at and created_at >= since:
                notifications.append({
                    "id": f"job-created-{jid}",
                    "type": "job_created",
                    "message": f"New job opening published: {title}",
                    "timestamp": created_at.isoformat(),
                    "job_id": jid,
                })

        # 3) JD analyses (Search Using JD)
        jd_res = await db.execute(
            select(JDAnalysis.job_id, JDAnalysis.jd_filename, JDAnalysis.submitted_at, JDAnalysis.submitted_by)
            .where(JDAnalysis.submitted_at >= since)
            .order_by(JDAnalysis.submitted_at.desc())
            .limit(cap)
        )
        for jd in jd_res.all():
            jid, jd_filename, submitted_at, submitted_by = jd
            file_part = f" ({jd_filename})" if jd_filename else ""
            by_part = f" by {submitted_by}" if submitted_by else ""
            notifications.append({
                "id": f"jd-{jid}",
                "type": "jd_analysis",
                "message": f"JD talent search completed{file_part}{by_part}",
                "timestamp": submitted_at.isoformat() if submitted_at else None,
                "job_id": jid,
            })

        # 4) Employee roster CSV/Excel upload
        upload_cfg = await db.execute(
            select(AppConfig.value).where(AppConfig.key == "employee_list_last_upload")
        )
        upload_raw = upload_cfg.scalar_one_or_none()
        if upload_raw:
            try:
                upload_meta = json.loads(upload_raw)
                upload_at = _parse_notification_timestamp(upload_meta.get("at"))
                if upload_at >= since:
                    count = upload_meta.get("count", 0)
                    notifications.append({
                        "id": f"employee-list-{upload_meta.get('at')}",
                        "type": "employee_list",
                        "message": f"Employee list updated ({count} employees in roster)",
                        "timestamp": upload_meta.get("at"),
                    })
            except (json.JSONDecodeError, TypeError):
                pass

        # 5) New users & admin invites
        users_res = await db.execute(
            select(User.id, User.name, User.email, User.mode, User.employment_type, User.created_at, User.last_login_at)
            .where(User.created_at >= since)
            .order_by(User.created_at.desc())
            .limit(cap)
        )
        for u in users_res.all():
            uid, name, email, mode, employment_type, created_at, last_login_at = u
            display = (name or email or "User").strip() or "User"
            if (mode or "").lower() == "admin" and not last_login_at:
                notifications.append({
                    "id": f"invite-{uid}",
                    "type": "admin_invite",
                    "message": f"Admin portal invite sent: {email}",
                    "timestamp": created_at.isoformat() if created_at else None,
                    "user_id": uid,
                    "email": email,
                })
            else:
                et = employment_type or "User"
                notifications.append({
                    "id": f"signup-{uid}",
                    "type": "user_registered",
                    "message": f"New user registered: {display} ({et})",
                    "timestamp": created_at.isoformat() if created_at else None,
                    "user_id": uid,
                    "email": email,
                })

        # 6) User logins
        login_res = await db.execute(
            select(User.id, User.name, User.email, User.last_login_at)
            .where(User.last_login_at >= since)
            .order_by(User.last_login_at.desc())
            .limit(cap)
        )
        for u in login_res.all():
            uid, name, email, last_login_at = u
            if not last_login_at:
                continue
            display = (name or email or "User").strip() or "User"
            notifications.append({
                "id": f"login-{uid}-{last_login_at.timestamp()}",
                "type": "login",
                "message": f"User signed in: {display}",
                "timestamp": last_login_at.isoformat(),
                "user_id": uid,
                "email": email,
            })

        notifications.sort(key=lambda n: _parse_notification_timestamp(n.get("timestamp")), reverse=True)
        notifications = notifications[:limit]
        unread_count = min(len(notifications), 99)
        return {"notifications": notifications, "unread_count": unread_count}
    except Exception as e:
        logger.error(f"Get notifications error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """List all users (Admin only)"""
    try:
        total_result = await db.execute(select(func.count(User.id)))
        total = total_result.scalar()
        
        users_query = select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        
        return {
            'total': total,
            'skip': skip,
            'limit': limit,
            'users': [
                {
                    'id': user.id,
                    'name': user.name,
                    'email': user.email,
                    'mode': user.mode or 'user',
                    'created_at': user.created_at.isoformat() if user.created_at else None
                }
                for user in users
            ]
        }
    
    except Exception as e:
        logger.error(f"List users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Modes that count as "platform admin" (Admin, HR, Talent Acquisition). Match case-insensitively.
PLATFORM_ADMIN_MODES_LOWER = ('admin', 'hr', 'talent_acquisition', 'talent acquisition')


@router.get("/users/platform-admins")
async def list_platform_admin_users(
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """List users who are currently on the platform as Admin, HR, or Talent Acquisition. Admin only."""
    try:
        users_query = select(User).where(
            func.lower(User.mode).in_(PLATFORM_ADMIN_MODES_LOWER)
        ).order_by(User.name)
        result = await db.execute(users_query)
        users = result.scalars().all()
        return {
            'users': [
                {
                    'id': u.id,
                    'name': u.name,
                    'email': u.email,
                    'mode': u.mode or 'user',
                    'employee_id': getattr(u, 'employee_id', None),
                    'created_at': u.created_at.isoformat() if u.created_at else None,
                    'has_logged_in': getattr(u, 'last_login_at', None) is not None,
                }
                for u in users
            ]
        }
    except Exception as e:
        logger.error(f"List platform admin users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Delete user (Admin only)"""
    try:
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        current_user_id = current_user.get("user_id")
        is_self_delete = current_user_id and str(current_user_id) == str(user_id)
        is_target_admin = (user.mode or "").strip().lower() == "admin"

        if is_target_admin and not is_self_delete:
            raise HTTPException(
                status_code=403,
                detail="Admin users cannot be removed by others. Admins can only remove themselves via Profile → Leave platform.",
            )

        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
        
        logger.info(f"Deleted user: {user_id}")
        return {"message": "User deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invite")
async def send_invite(
    payload: InviteRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db),
):
    """
    Send an admin portal invite to a company employee. Creates user with temp password and emails
    a set-password link. Admin only.
    """
    try:
        email = payload.email.lower().strip()
        role_lower = (payload.role or "").strip().lower()
        if role_lower in ("admin", "administrator"):
            mode = "admin"
        elif role_lower in ("talent acquisition", "talent_acquisition", "ta"):
            mode = "talent_acquisition"
        elif role_lower in ("hr", "human resources"):
            mode = "hr"
        else:
            mode = "admin"

        emp_result = await db.execute(
            select(CompanyEmployeeList).where(func.lower(CompanyEmployeeList.email) == email)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            raise HTTPException(
                status_code=400,
                detail="Email not found in company employee list. Add the employee to the list first.",
            )

        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="This user already has portal access. They can log in or use Forgot Password.",
            )

        custom_password = (payload.temporary_password or "").strip()
        if custom_password and len(custom_password) < 6:
            raise HTTPException(status_code=400, detail="Temporary password must be at least 6 characters.")
        temp_password = custom_password if custom_password else secrets.token_urlsafe(12)
        name = (employee.full_name or email).strip() or "User"
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(temp_password),
            mode=mode,
            employee_id=(employee.employee_id or "").strip().upper(),
            employment_type=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        token = create_invite_token(email)
        base_url = (getattr(settings, "frontend_base_url", None) or "http://localhost:3005").rstrip("/")
        set_password_link = f"{base_url}/set-password?token={token}"
        custom_stripped = (payload.custom_set_password_link or "").strip()
        link_for_email = custom_stripped if custom_stripped else set_password_link
        if custom_stripped:
            logger.info("Invite email using custom link (first 80 chars): %s", custom_stripped[:80])

        email_sent = False
        if is_email_configured():
            try:
                send_admin_invite_email(
                    to_email=email,
                    login_id=email,
                    temporary_password=temp_password,
                    set_password_link=link_for_email,
                )
                email_sent = True
            except Exception as send_err:
                logger.warning("Invite email could not be sent (user was created): %s", send_err)

        logger.info(f"Invite flow for {email} by {current_user.get('email')}: user created, email_sent=%s", email_sent)
        return {
            "message": (
                f"Invite sent to {email}. They will receive an email with a link to set their password."
                if email_sent
                else f"User created for {email}. Email is not configured or could not be sent; use the message below to share credentials manually."
            ),
            "email_sent": email_sent,
            "login_id": email,
            "temporary_password": temp_password,
            "set_password_link": set_password_link,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Invite error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/resumes/{resume_id}/type")
async def update_resume_type(
    resume_id: int,
    payload: UpdateResumeTypeRequest,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Update a resume's source type (e.g. Company Employee → Guest User when they leave). Admin only."""
    try:
        source_type = (payload.source_type or '').strip().lower().replace(' ', '_')
        if source_type not in ALLOWED_SOURCE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid source_type. Allowed: {', '.join(sorted(ALLOWED_SOURCE_TYPES))}"
            )
        result = await db.execute(select(Resume).where(Resume.id == resume_id))
        resume = result.scalar_one_or_none()
        if not resume and payload.source_id and (payload.source_id or '').strip():
            # Fallback: find by (company_employee, source_id) when id not found (e.g. wrong id from frontend)
            lookup_id = (payload.source_id or '').strip().upper()
            fallback_result = await db.execute(
                select(Resume).where(
                    Resume.source_type == 'company_employee',
                    func.upper(func.coalesce(Resume.source_id, '')) == lookup_id
                )
            )
            resume = fallback_result.scalar_one_or_none()
        if not resume:
            logger.warning(f"Resume not found: id={resume_id}, source_id={getattr(payload, 'source_id', None)}")
            raise HTTPException(status_code=404, detail="Resume not found")
        resume.source_type = source_type
        meta = dict(resume.meta_data or {})
        meta['user_type'] = get_user_type_from_source_type(source_type)
        resume.meta_data = meta
        if source_type == 'guest':
            resume.source_id = None
        await db.commit()
        pk = resume.id
        logger.info(f"Admin updated resume {resume_id} type to {source_type}")

        # Build response: reload with relationships and format. If anything fails, return 200 with minimal payload.
        try:
            from sqlalchemy.orm import selectinload
            reload_result = await db.execute(
                select(Resume).where(Resume.id == pk).options(
                    selectinload(Resume.work_history),
                    selectinload(Resume.certificates),
                    selectinload(Resume.educations),
                )
            )
            resume_loaded = reload_result.scalar_one_or_none()
            if resume_loaded:
                return format_resume_response(resume_loaded)
        except Exception as e:
            logger.warning(f"Format response after type update failed (update succeeded): {e}", exc_info=True)

        return {
            "id": pk,
            "source_type": source_type,
            "user_type": get_user_type_from_source_type(source_type),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update resume type error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/resumes/bulk")
async def bulk_delete_resumes(
    resume_ids: list[int],
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Bulk delete resumes (Admin only)"""
    try:
        deleted_count = 0
        for resume_id in resume_ids:
            query = select(Resume).where(Resume.id == resume_id)
            result = await db.execute(query)
            resume = result.scalar_one_or_none()
            if resume:
                await db.execute(delete(Resume).where(Resume.id == resume_id))
                deleted_count += 1
        
        await db.commit()
        
        logger.info(f"Bulk deleted {deleted_count} resumes")
        return {
            'message': f'Successfully deleted {deleted_count} resumes',
            'deleted_count': deleted_count
        }
    
    except Exception as e:
        logger.error(f"Bulk delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
