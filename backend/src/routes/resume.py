from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, Security, Form
from fastapi.responses import Response, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_, func, cast, String
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from datetime import datetime
import asyncio
import os
import uuid
import aiofiles
from pathlib import Path
from urllib.parse import urlparse
from src.models.resume import Resume
from src.models.job_application import JobApplication
from src.models.job_opening import JobOpening
from src.config.settings import settings
from src.config.database import get_postgres_db
from src.middleware.auth_middleware import get_admin_user, get_current_user, decode_access_token, is_token_blacklisted
from src.services.storage import save_uploaded_file, delete_file
from src.services.resume_parser import parse_resume
from src.utils.validators import validate_file_type
from src.utils.logger import get_logger
from src.utils.response_formatter import format_resume_response, format_resume_list_response
from src.utils.user_type_mapper import normalize_user_type, get_source_type_from_user_type, get_user_type_from_source_type
from src.utils.resume_processor import save_structured_resume_data

security = HTTPBearer(auto_error=False)
logger = get_logger(__name__)
router = APIRouter(prefix="/api/resumes", tags=["Resumes"])

ALLOWED_EXTENSIONS = ['pdf', 'docx']

def escape_like_pattern(pattern: str) -> str:
    """Escape SQL LIKE wildcards for safe pattern matching."""
    return pattern.replace('%', '\\%').replace('_', '\\_')

def clean_null_bytes(text: str) -> str:
    """Remove null bytes from text to prevent PostgreSQL errors"""
    if text is None:
        return ""
    if isinstance(text, str):
        return text.replace('\x00', '').replace('\0', '')
    return str(text).replace('\x00', '').replace('\0', '')

def clean_dict_values(data: dict) -> dict:
    """Recursively clean null bytes from dictionary values"""
    if not isinstance(data, dict):
        return data
    cleaned = {}
    for key, value in data.items():
        if isinstance(value, str):
            cleaned[key] = clean_null_bytes(value)
        elif isinstance(value, dict):
            cleaned[key] = clean_dict_values(value)
        elif isinstance(value, list):
            cleaned[key] = [clean_null_bytes(str(v)) if isinstance(v, str) else v for v in value]
        else:
            cleaned[key] = value
    return cleaned

# Parse-only endpoint function - registered directly on app in main.py to avoid route conflicts
async def parse_resume_only(
    file: UploadFile = File(..., description="Resume file (PDF or DOCX)"),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Parse resume and return extracted data without saving to database.
    Used for autofilling form fields in the frontend.
    This endpoint allows both authenticated and unauthenticated access.
    No authentication required - works for all users including guests, employees, and freelancers.
    IMPORTANT: This function is registered directly on the app in main.py to avoid route conflicts.
    """
    logger.info(f"✅ Parse-only endpoint CALLED for file: {file.filename if file.filename else 'unknown'}")
    logger.info(f"✅ Request received - POST /api/resumes/parse-only")
    file_path = None
    try:
        # Validate file
        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Validate file type
        if not validate_file_type(file.filename, ALLOWED_EXTENSIONS):
            raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and DOCX allowed.")
        
        # Save file temporarily (parse-only doesn't need database storage)
        file_path, file_url, file_content, mime_type = await save_uploaded_file(file, subfolder="temp_parse", save_to_db=False)
        file_extension = file.filename.split('.')[-1]
        
        try:
            # Parse resume (without form data)
            parsed_data = await parse_resume(file_path, file_extension)
            
            # Extract phone if available
            phone = parsed_data.get('resume_phone', '') or ''
            
            # Extract address details
            address = parsed_data.get('resume_address', '') or ''
            city = parsed_data.get('resume_city', '') or ''
            country = parsed_data.get('resume_country', '') or ''
            zip_code = parsed_data.get('resume_zip_code', '') or ''
            
            # If city/country not extracted separately, try to parse from location
            location = parsed_data.get('resume_location', '')
            if not city and not country and location and location != "Not mentioned":
                # Try to split by comma
                parts = [p.strip() for p in location.split(',')]
                if len(parts) >= 2:
                    city = parts[0] if not city else city
                    country = parts[-1] if not country else country
                elif len(parts) == 1:
                    city = parts[0] if not city else city
            
            # Extract current company
            current_company = parsed_data.get('current_company', '') or ''
            # If not found, try to get from work_history
            if not current_company:
                work_history = parsed_data.get('work_history', [])
                if work_history:
                    for job in work_history:
                        if job.get('is_current') == 1:
                            current_company = job.get('company', '')
                            break
                    # If no current job, use most recent
                    if not current_company and work_history:
                        current_company = work_history[0].get('company', '')
            
            # Split name into first and last
            full_name = parsed_data.get('resume_candidate_name', '')
            name_parts = full_name.split() if full_name and full_name != "Not mentioned" else []
            firstName = name_parts[0] if len(name_parts) > 0 else ''
            lastName = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
            
            # Format skills as comma-separated string
            skills_list = parsed_data.get('all_skills', []) or parsed_data.get('resume_technical_skills', [])
            skills = ', '.join(skills_list) if isinstance(skills_list, list) else str(skills_list)
            
            # Format education
            degree = parsed_data.get('resume_degree', '')
            university = parsed_data.get('resume_university', '')
            education = f"{degree} - {university}".strip(' -') if degree != "Not mentioned" or university != "Not mentioned" else ''
            
            # Return formatted data for frontend
            return {
                'success': True,
                'data': {
                    'firstName': firstName,
                    'lastName': lastName,
                    'email': parsed_data.get('resume_contact_info', '') if parsed_data.get('resume_contact_info') != "Not mentioned" else '',
                    'phone': phone,
                    'address': address,
                    'city': city,
                    'country': country,
                    'zipCode': zip_code,
                    'location': location if location != "Not mentioned" else '',
                    'role': parsed_data.get('resume_role', '') if parsed_data.get('resume_role') != "Not mentioned" else '',
                    'currentCompany': current_company,
                    'experience': str(int(parsed_data.get('resume_experience', 0))),
                    'skills': skills,
                    'education': education,
                    'fullName': full_name if full_name != "Not mentioned" else ''
                }
            }
        finally:
            # Clean up temporary file
            if file_path and os.path.exists(file_path):
                try:
                    os.unlink(file_path)
                except:
                    pass
                    
    except asyncio.CancelledError:
        # Handle server shutdown during processing
        logger.warning("Request cancelled (server may be shutting down)")
        # Clean up file if it exists
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except:
                pass
        raise HTTPException(
            status_code=503, 
            detail="Service temporarily unavailable. Please try again."
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resume parse-only error: {e}")
        # Clean up file if it exists
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")

async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get current user if authenticated, otherwise return None"""
    # If no credentials provided, allow access (guest mode)
    if credentials is None:
        return None
    
    try:
        token = credentials.credentials
        if not token:
            return None
        
        if await is_token_blacklisted(token, db):
            return None
        
        payload = decode_access_token(token)
        if payload is None:
            return None
        
        user_email = payload.get("sub")
        user_mode = payload.get("mode", "user")
        if user_email is None:
            return None
        
        return {
            "email": user_email,
            "mode": user_mode,
            "user_id": payload.get("user_id")
        }
    except Exception:
        return None
    except Exception as e:
        # Log error but don't block access
        logger.debug(f"Optional auth error (allowing guest access): {e}")
        return None

@router.get("/search")
async def search_resumes(
    skills: str | None = Query(None, description="Comma-separated skills"),
    q: str | None = Query(None, description="Free-text search"),
    user_types: Optional[List[str]] = Query(None, description="Filter by user types"),
    min_experience: Optional[float] = Query(None, ge=0, description="Minimum years of experience"),
    max_experience: Optional[float] = Query(None, ge=0, description="Maximum years of experience"),
    locations: Optional[List[str]] = Query(None, description="Filter by locations"),
    roles: Optional[List[str]] = Query(None, description="Filter by roles"),
    current_user: Optional[dict] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Search resumes by skills, free-text query, and advanced filters"""
    try:
        import time
        start_time = time.time()
        # Coerce experience params so filtering is always applied when user sets them
        min_exp = float(min_experience) if min_experience is not None else None
        max_exp = float(max_experience) if max_experience is not None else None

        query = select(Resume)
        skill_list = None
        
        # Filter by skills
        if skills:
            skill_list = [s.strip() for s in skills.split(',') if s.strip()]
            if skill_list:
                # For PostgreSQL ARRAY, convert to string and search (case-insensitive)
                # Handle NULL/empty arrays by using COALESCE
                for skill in skill_list:
                    # Use COALESCE to handle NULL arrays, convert to empty string if NULL
                    # Escape LIKE wildcards to prevent search manipulation
                    escaped_skill = escape_like_pattern(skill.lower())
                    query = query.where(
                        func.lower(
                            func.coalesce(
                                func.array_to_string(Resume.skills, ','),
                                ''
                            )
                        ).like(f'%{escaped_skill}%', escape='\\')
                    )
        
        # Free-text search
        if q:
            # Escape LIKE wildcards to prevent search manipulation
            escaped_q = escape_like_pattern(q)
            like = f"%{escaped_q}%"
            query = query.where(
                or_(
                    Resume.raw_text.ilike(like, escape='\\'),
                    Resume.filename.ilike(like, escape='\\')
                )
            )
        
        # Filter by user types
        if user_types:
            normalized_user_types = [normalize_user_type(ut) for ut in user_types]
            source_types = [get_source_type_from_user_type(ut) for ut in normalized_user_types]
            
            conditions = []
            for source_type in source_types:
                conditions.append(Resume.source_type == source_type)
            
            for user_type in normalized_user_types:
                # Use JSONB operator for meta_data.user_type (PostgreSQL -> operator)
                conditions.append(
                    Resume.meta_data['user_type'].astext == user_type
                )
            
            if conditions:
                query = query.where(or_(*conditions))
        
        # Experience filtering is done in-loop below using effective_years (column or parsed_data)
        # so display and filter use the same value; no SQL filter here.

        from sqlalchemy.orm import selectinload
        # Execute query
        query = query.options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations)
        ).order_by(Resume.uploaded_at.desc()).limit(500)  # Increased limit for search
        result = await db.execute(query)
        results = result.scalars().all()
        
        # Apply client-side filters for locations and roles (JSONB filtering is complex)
        # Apply client-side filters for locations and roles (JSONB filtering is complex)
        filtered_results = []
        for r in results:
            parsed = r.parsed_data or {}
            source_meta = r.source_metadata or {}
            form_data = source_meta.get('form_data', {})

            # Filter by experience range (use same source as display: column or parsed_data)
            raw_exp = r.experience_years if r.experience_years is not None else (parsed.get('resume_experience') or parsed.get('experience_years') or 0)
            try:
                effective_years = float(raw_exp) if raw_exp not in (None, '') else 0.0
            except (TypeError, ValueError):
                effective_years = 0.0
            if min_exp is not None and effective_years < min_exp:
                continue
            if max_exp is not None and effective_years > max_exp:
                continue

            # Filter by locations
            if locations:
                # Track if we found a match in any of the candidate's locations
                curr_loc = str(form_data.get('location') or parsed.get('resume_location', parsed.get('location', ''))).lower()
                pref_loc = str(r.meta_data.get('preferred_location') or r.meta_data.get('meta_data', {}).get('preferred_location') or '').lower()
                
                match_found = False
                for loc_query in locations:
                    loc_query_lower = loc_query.lower()
                    if loc_query_lower in curr_loc or (pref_loc and loc_query_lower in pref_loc):
                        match_found = True
                        break
                
                if not match_found:
                    continue
            
            # Filter by roles
            if roles:
                # Priority: Form > Parsed
                role = form_data.get('role')
                if not role:
                     role = parsed.get('resume_role', parsed.get('role', ''))
                     
                if not role or role == 'Not mentioned':
                    continue
                if not any(role_filter.lower() in str(role).lower() for role_filter in roles):
                    continue
            
            filtered_results.append(r)
        
        # Format responses
        formatted_resumes = [format_resume_response(r) for r in filtered_results]
        
        # Calculate matched skills for each resume
        for i, r in enumerate(filtered_results):
            if skill_list and r.skills:
                formatted_resumes[i]['matched_skills'] = list(set(r.skills) & set(skill_list))
            else:
                formatted_resumes[i]['matched_skills'] = []
        
        search_time = round((time.time() - start_time) * 1000, 2)  # milliseconds
        
        return {
            'total': len(formatted_resumes),
            'search_skills': skill_list or [],
            'query': q or "",
            'search_time_ms': search_time,
            'resumes': formatted_resumes
        }
    except Exception as e:
        logger.error(f"Search resumes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_resumes(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Upload multiple resume files (Admin only)
    Parses resumes and stores in database
    Handles duplicate emails by updating existing records
    """
    try:
        uploaded_resumes = []
        errors = []
        
        for file in files:
            # Start a new transaction for each file to prevent rollback cascade
            try:
                # Validate file type
                if not validate_file_type(file.filename, ALLOWED_EXTENSIONS):
                    errors.append(f"{file.filename}: Invalid file type. Only PDF and DOCX allowed.")
                    continue
                
                # Save file to database (returns file_content and mime_type)
                file_id, file_url, file_content, mime_type = await save_uploaded_file(file, subfolder="resumes", save_to_db=True)
                file_extension = file.filename.split('.')[-1]
                
                # Save file temporarily for parsing (parser needs file path)
                import tempfile
                with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as tmp_file:
                    tmp_file.write(file_content)
                    file_path = tmp_file.name
                
                try:
                    # Parse resume
                    logger.info(f"Parsing resume: {file.filename}")
                    parsed_data = await parse_resume(file_path, file_extension)
                    
                    # Clean null bytes from parsed data
                    parsed_data = clean_dict_values(parsed_data)
                    
                    # Check for existing resume by email (to handle unique constraint)
                    # Make it case-insensitive
                    resume_email = parsed_data.get('resume_contact_info')
                    existing_resume = None
                    if resume_email and resume_email != "Not mentioned":
                        # Case-insensitive email search
                        stmt = select(Resume).where(
                            func.lower(Resume.parsed_data['resume_contact_info'].astext) == resume_email.lower()
                        )
                        result = await db.execute(stmt)
                        existing_resume = result.scalar_one_or_none()
                    
                    # For admin uploads, update existing or create new
                    if existing_resume:
                        # Update existing record
                        logger.info(f"Updating existing resume for email: {resume_email} (ID: {existing_resume.id})")
                        existing_resume.filename = file.filename
                        existing_resume.file_url = file_url  # Will be updated with actual resume_id after save
                        existing_resume.file_content = file_content
                        existing_resume.file_mime_type = mime_type
                        existing_resume.raw_text = clean_null_bytes(parsed_data.get('raw_text', ''))
                        existing_resume.parsed_data = parsed_data
                        existing_resume.skills = parsed_data.get('resume_technical_skills', parsed_data.get('all_skills', []))
                        existing_resume.experience_years = parsed_data.get('resume_experience', parsed_data.get('experience_years', 0))
                        existing_resume.uploaded_by = current_user['email']
                        existing_resume.meta_data = {
                            'parsing_method': parsed_data.get('parsing_method', 'unknown'),
                            'file_size': len(file_content),
                            'user_type': get_user_type_from_source_type('admin'),
                            'notice_period': parsed_data.get('notice_period', 0),
                            'ready_to_relocate': parsed_data.get('ready_to_relocate', False),
                            'is_update': True
                        }
                        resume = existing_resume
                    else:
                        # Generate unique source_id for admin uploads to avoid unique constraint violation
                        admin_source_id = f"admin_{uuid.uuid4().hex[:16]}_{int(datetime.utcnow().timestamp() * 1000)}"
                        
                        # Create new resume record with file_content
                        logger.info(f"Creating new resume record for admin upload: {file.filename} (source_id: {admin_source_id})")
                        resume = Resume(
                            filename=file.filename,
                            file_url=file_url,  # Will be updated with actual resume_id after save
                            file_content=file_content,  # Store file in database
                            file_mime_type=mime_type,
                            source_type='admin',
                            source_id=admin_source_id,
                            raw_text=clean_null_bytes(parsed_data.get('raw_text', '')),
                            parsed_data=parsed_data,
                            skills=parsed_data.get('resume_technical_skills', parsed_data.get('all_skills', [])),
                            experience_years=parsed_data.get('resume_experience', parsed_data.get('experience_years', 0)),
                            uploaded_by=current_user['email'],
                            meta_data={
                                'parsing_method': parsed_data.get('parsing_method', 'unknown'),
                                'file_size': len(file_content),
                                'user_type': get_user_type_from_source_type('admin'),
                                'notice_period': parsed_data.get('notice_period', 0),
                                'ready_to_relocate': parsed_data.get('ready_to_relocate', False)
                            }
                        )
                        db.add(resume)
                    
                    # Try to commit, catch unique constraint errors
                    try:
                        await db.commit()
                        await db.refresh(resume)
                        
                        # Update file_url with actual resume_id
                        resume.file_url = f"/api/resumes/{resume.id}/file"
                        await db.commit()
                        
                        logger.info(f"Resume saved to database with ID: {resume.id}")
                        
                        # Save structured data (Experience/Certification)
                        await save_structured_resume_data(db, resume.id, parsed_data, clear_existing=True)
                        await db.commit()
                        
                        # Verify the resume was saved by counting total resumes
                        count_result = await db.execute(select(func.count(Resume.id)))
                        total_count = count_result.scalar()
                        logger.info(f"Total resumes in database after upload: {total_count}")
                        
                        uploaded_resumes.append({
                            'id': resume.id,
                            'filename': resume.filename,
                            'candidate_name': parsed_data.get('resume_candidate_name', 'Unknown'),
                            'skills': resume.skills,
                            'experience_years': resume.experience_years
                        })
                        
                        logger.info(f"Successfully uploaded resume: {file.filename} (ID: {resume.id}, Total count: {total_count})")
                    
                    except Exception as commit_error:
                        # Rollback on commit error
                        await db.rollback()
                        error_str = str(commit_error)
                        
                        # If it's a duplicate email error, try to find and update the existing record
                        if "UniqueViolationError" in error_str or "uq_resume_email_json" in error_str:
                            logger.warning(f"Duplicate email detected during commit for {file.filename}, attempting to update existing record")
                            
                            # Try to find the existing record again (might have been created between check and commit)
                            if resume_email and resume_email != "Not mentioned":
                                stmt = select(Resume).where(
                                    func.lower(Resume.parsed_data['resume_contact_info'].astext) == resume_email.lower()
                                )
                                result = await db.execute(stmt)
                                existing_resume_retry = result.scalar_one_or_none()
                                
                                if existing_resume_retry:
                                    # Update the existing record
                                    existing_resume_retry.filename = file.filename
                                    existing_resume_retry.file_url = f"/api/resumes/{existing_resume_retry.id}/file"
                                    existing_resume_retry.file_content = file_content
                                    existing_resume_retry.file_mime_type = mime_type
                                    existing_resume_retry.raw_text = clean_null_bytes(parsed_data.get('raw_text', ''))
                                    existing_resume_retry.parsed_data = parsed_data
                                    existing_resume_retry.skills = parsed_data.get('resume_technical_skills', parsed_data.get('all_skills', []))
                                    existing_resume_retry.experience_years = parsed_data.get('resume_experience', parsed_data.get('experience_years', 0))
                                    existing_resume_retry.uploaded_by = current_user['email']
                                    existing_resume_retry.meta_data = {
                                        'parsing_method': parsed_data.get('parsing_method', 'unknown'),
                                        'file_size': len(file_content),
                                        'user_type': get_user_type_from_source_type('admin'),
                                        'notice_period': parsed_data.get('notice_period', 0),
                                        'ready_to_relocate': parsed_data.get('ready_to_relocate', False),
                                        'is_update': True
                                    }
                                    
                                    await db.commit()
                                    await db.refresh(existing_resume_retry)
                                    
                                    # Save structured data
                                    await save_structured_resume_data(db, existing_resume_retry.id, parsed_data, clear_existing=True)
                                    await db.commit()
                                    
                                    uploaded_resumes.append({
                                        'id': existing_resume_retry.id,
                                        'filename': existing_resume_retry.filename,
                                        'candidate_name': parsed_data.get('resume_candidate_name', 'Unknown'),
                                        'skills': existing_resume_retry.skills,
                                        'experience_years': existing_resume_retry.experience_years
                                    })
                                    
                                    logger.info(f"Updated existing resume for {file.filename} (ID: {existing_resume_retry.id})")
                                    continue  # Skip to next file, don't add to errors
                            
                            # If we couldn't update, add to errors
                            errors.append(f"{file.filename}: Duplicate email - resume with this email already exists. Skipping.")
                            continue  # Skip to next file
                        else:
                            # Re-raise if it's not a duplicate error
                            raise commit_error
                
                finally:
                    # Clean up temporary file
                    if os.path.exists(file_path):
                        try:
                            os.unlink(file_path)
                        except:
                            pass
            
            except Exception as e:
                # Rollback this file's transaction and continue with next file
                try:
                    await db.rollback()
                except:
                    pass  # Ignore rollback errors
                
                import traceback
                logger.error(f"Failed to process {file.filename}: {e}", exc_info=True)
                logger.error(f"Traceback: {traceback.format_exc()}")
                
                # Check if it's a duplicate email error
                error_str = str(e)
                if "UniqueViolationError" in error_str or "uq_resume_email_json" in error_str:
                    errors.append(f"{file.filename}: Duplicate email - resume with this email already exists. Skipping.")
                else:
                    errors.append(f"{file.filename}: {str(e)}")
        
        return {
            'success': len(uploaded_resumes),
            'failed': len(errors),
            'uploaded_resumes': uploaded_resumes,
            'errors': errors
        }
    
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def list_resumes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=5000),  # Increased max limit for dashboard
    user_types: Optional[List[str]] = Query(None, description="Filter by user types (Guest, Company Employee, Freelancer, Hired Force, Admin Uploads)"),
    current_user: Optional[dict] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """List all resumes with pagination and optional user type filtering"""
    try:
        # Avoid async lazy-loads during response formatting (work_history/certificates/educations)
        # by eager-loading relationships up-front.
        # Build base query
        query = select(Resume).options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations),
        )
        count_query = select(func.count(Resume.id))
        
        # Filter by user types if provided
        if user_types:
            # Normalize user types
            normalized_user_types = [normalize_user_type(ut) for ut in user_types]
            # Convert to source_types for filtering
            source_types = [get_source_type_from_user_type(ut) for ut in normalized_user_types]
            
            # Filter by source_type or meta_data.user_type
            conditions = []
            for source_type in source_types:
                conditions.append(Resume.source_type == source_type)
            
            # Also check meta_data.user_type for backward compatibility
            for user_type in normalized_user_types:
                # Use JSONB operator for meta_data.user_type (PostgreSQL -> operator)
                conditions.append(
                    Resume.meta_data['user_type'].astext == user_type
                )
            
            if conditions:
                query = query.where(or_(*conditions))
                count_query = count_query.where(or_(*conditions))
        
        # Count total
        count_result = await db.execute(count_query)
        total = count_result.scalar()
        
        # Get resumes
        query = query.order_by(Resume.uploaded_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        resumes = result.scalars().all()
        
        # Format responses
        return format_resume_list_response(resumes, total, skip, limit)
    
    except Exception as e:
        logger.error(f"List resumes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{resume_id}/file", response_class=Response)
async def get_resume_file(
    resume_id: int,
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Serve resume file from database or filesystem (for backward compatibility).
    Works across different machines since file is stored in PostgreSQL.
    """
    try:
        # Query resume
        query = select(Resume).where(Resume.id == resume_id)
        result = await db.execute(query)
        resume = result.scalar_one_or_none()
        
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        
        # Log resume file status for debugging
        has_file_content = resume.file_content is not None and len(resume.file_content) > 0
        logger.info(
            f"Getting resume file for resume_id={resume_id}, "
            f"filename={resume.filename}, "
            f"file_content={'present' if has_file_content else 'NULL'}, "
            f"file_url={resume.file_url}"
        )
        
        # Check if file_content exists in database
        if resume.file_content:
            # Determine content type
            mime_type = resume.file_mime_type or 'application/pdf'
            
            # Return file as response
            return Response(
                content=resume.file_content,
                media_type=mime_type,
                headers={
                    "Content-Disposition": f'inline; filename="{resume.filename}"',
                    "Cache-Control": "public, max-age=3600"
                }
            )
        else:
            # Fallback: Try to serve from filesystem for old records
            if resume.file_url:
                file_path = None
                
                # Handle different file_url formats:
                # 1. Full HTTP URL: http://localhost:8000/uploads/resumes/file.pdf
                # 2. Relative path: /uploads/resumes/file.pdf
                # 3. Google Drive URL: https://drive.google.com/...
                # 4. API endpoint: /api/resumes/{id}/file (shouldn't happen for old records)
                
                if resume.file_url.startswith('http://') or resume.file_url.startswith('https://'):
                    # Full URL - extract the path
                    parsed_url = urlparse(resume.file_url)
                    path = parsed_url.path
                    
                    # Check if it's a Google Drive URL
                    if 'drive.google.com' in resume.file_url or 'docs.google.com' in resume.file_url:
                        # Can't serve Google Drive files directly - would need to download first
                        raise HTTPException(
                            status_code=404,
                            detail="Resume file is stored on Google Drive. Please re-upload to store in database."
                        )
                    
                    # Extract local file path from URL
                    if path.startswith('/uploads/') or path.startswith(f'/{settings.upload_dir}/'):
                        file_path = Path(path.lstrip('/'))
                elif resume.file_url.startswith('/uploads/') or resume.file_url.startswith(f'/{settings.upload_dir}/'):
                    # Relative path - try multiple possible locations
                    relative_path = resume.file_url.lstrip('/')
                    possible_paths = [
                        Path(relative_path),  # Relative to current directory
                        Path(settings.upload_dir) / relative_path,  # From settings
                        Path('uploads') / relative_path,  # Default uploads folder
                    ]
                    
                    # Try each path until we find one that exists
                    file_path = None
                    for path in possible_paths:
                        if path.exists():
                            file_path = path
                            logger.debug(f"Found file at path: {file_path}")
                            break
                    
                    # If none found, use the first one for error reporting
                    if not file_path:
                        file_path = Path(relative_path)
                elif resume.file_url.startswith('/api/resumes/'):
                    # This is an API endpoint - shouldn't happen for old records, but handle gracefully
                    raise HTTPException(
                        status_code=404,
                        detail="Resume file not found in database. Please re-upload the resume."
                    )
                
                # Try to read from filesystem if we have a valid path
                if file_path and file_path.exists():
                    try:
                        # Read file from filesystem
                        async with aiofiles.open(file_path, 'rb') as f:
                            file_content = await f.read()
                        
                        # Determine MIME type from filename
                        ext = resume.filename.split('.')[-1].lower() if resume.filename else 'pdf'
                        mime_type = 'application/pdf' if ext == 'pdf' else \
                                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document' if ext == 'docx' else \
                                   'application/octet-stream'
                        
                        return Response(
                            content=file_content,
                            media_type=mime_type,
                            headers={
                                "Content-Disposition": f'inline; filename="{resume.filename}"',
                                "Cache-Control": "public, max-age=3600"
                            }
                        )
                    except Exception as read_error:
                        logger.error(f"Failed to read file from filesystem: {read_error}")
                        raise HTTPException(
                            status_code=500,
                            detail="Failed to read resume file from filesystem."
                        )
                elif file_path:
                    # File path exists but file doesn't
                    logger.warning(
                        f"File not found at path: {file_path} "
                        f"(resume_id={resume_id}, filename={resume.filename}, file_url={resume.file_url})"
                    )
                    raise HTTPException(
                        status_code=404,
                        detail=f"Resume file not found. The file may have been deleted from filesystem. "
                               f"Resume ID: {resume_id}, Filename: {resume.filename}. "
                               f"Please re-upload this resume to store it in the database."
                    )
                else:
                    # Couldn't determine file path
                    raise HTTPException(
                        status_code=404,
                        detail="Resume file not found in database. Please re-upload the resume."
                    )
            else:
                raise HTTPException(
                    status_code=404,
                    detail="Resume file not found in database. Please re-upload the resume."
                )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get resume file error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/file-by-filename/{filename:path}")
async def get_resume_by_filename(
    filename: str,
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Serve resume file by filename (for backward compatibility with old URLs).
    This handles requests like /api/resumes/filename.pdf
    """
    try:
        # Extract just the filename without path
        filename_only = Path(filename).name
        
        # Try to find resume by filename
        query = select(Resume).where(Resume.filename == filename_only)
        result = await db.execute(query)
        resume = result.scalar_one_or_none()
        
        if not resume:
            # Try to find by file_url containing the filename
            query = select(Resume).where(Resume.file_url.like(f'%{filename_only}%'))
            result = await db.execute(query)
            resume = result.scalar_one_or_none()
        
        if not resume:
            raise HTTPException(status_code=404, detail=f"Resume with filename '{filename_only}' not found")
        
        # Use the existing file serving logic
        return await get_resume_file(resume.id, db)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get resume by filename error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{resume_id}")
async def get_resume(
    resume_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get specific resume details"""
    try:
        from sqlalchemy.orm import selectinload
        query = select(Resume).where(Resume.id == resume_id).options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations)
        )
        result = await db.execute(query)
        resume = result.scalar_one_or_none()
        
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        
        # Format response using formatter
        response = format_resume_response(resume)
        # Add raw_text preview
        response['raw_text'] = resume.raw_text[:500] + '...' if resume.raw_text and len(resume.raw_text) > 500 else resume.raw_text
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get resume error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: int,
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Delete resume (Admin only)"""
    try:
        query = select(Resume).where(Resume.id == resume_id)
        result = await db.execute(query)
        resume = result.scalar_one_or_none()
        
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        
        # Delete file from disk
        file_path = resume.file_url.replace('/', '\\').lstrip('\\')
        delete_file(file_path)
        
        # Delete from database
        await db.execute(delete(Resume).where(Resume.id == resume_id))
        await db.commit()
        
        logger.info(f"Deleted resume: {resume_id}")
        return {"message": "Resume deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete resume error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search/by-skills")
async def search_resumes_by_skills(
    skills: str = Query(..., description="Comma-separated skills"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Search resumes by skills"""
    try:
        skill_list = [s.strip() for s in skills.split(',')]
        
        # Query resumes that have any of the specified skills
        # Use array_to_string for PostgreSQL ARRAY search (case-insensitive)
        # Handle NULL/empty arrays by using COALESCE
        query = select(Resume)
        for skill in skill_list:
            query = query.where(
                func.lower(
                    func.coalesce(
                        func.array_to_string(Resume.skills, ','),
                        ''
                    )
                ).like(f'%{skill.lower()}%')
            )
        query = query.order_by(Resume.uploaded_at.desc())
        result = await db.execute(query)
        resumes = result.scalars().all()
        
        formatted_resumes = [format_resume_response(r) for r in resumes]
        
        # Add matched skills
        for i, r in enumerate(resumes):
            formatted_resumes[i]['matched_skills'] = list(set(r.skills or []) & set(skill_list))
            
        return {
            'total': len(formatted_resumes),
            'search_skills': skill_list,
            'resumes': formatted_resumes
        }
    
    except Exception as e:
        logger.error(f"Search resumes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload/user-profile")
async def upload_user_profile_resume(
    file: UploadFile = File(...),
    userType: str = Form(None),
    fullName: str = Form(None),
    email: str = Form(None),
    phone: str = Form(None),
    experience: str = Form(None),
    skills: str = Form(None),
    location: str = Form(None),
    role: str = Form(None),
    education: str = Form(None),  # JSON string of education array
    experiences: str = Form(None),  # JSON string of experiences array
    noticePeriod: int = Form(0),
    currentlyWorking: bool = Form(True),
    currentCompany: str = Form(None),
    readyToRelocate: bool = Form(False),
    preferredLocation: str = Form(None),
    linkedIn: str = Form(None),
    portfolio: str = Form(None),
    jobId: Optional[str] = Form(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Upload resume with user profile data (for regular users)
    Works with or without authentication (for guest users)
    Stores resume in PostgreSQL and profile data in metadata
    """
    try:
        # Get user email from token if authenticated, otherwise use provided email
        user_email = None
        if credentials:
            payload = decode_access_token(credentials.credentials)
            if payload:
                user_email = payload.get('sub')
        
        # Use provided email or authenticated user email
        uploader_email = email or user_email or 'guest@unknown.com'
        
        # Map user type to source_type
        source_type_map = {
            'Guest User': 'guest',
            'Guest': 'guest',
            'Hired Forces': 'hired_force',
            'Hired Force': 'hired_force',
            'Company Employee': 'company_employee',
            'Freelancer': 'freelancer'
        }
        source_type = source_type_map.get(userType, 'guest')
        
        # Validate file type
        if not validate_file_type(file.filename, ALLOWED_EXTENSIONS):
            raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and DOCX allowed.")
        
        # Save file to database (returns file_content and mime_type)
        file_id, file_url, file_content, mime_type = await save_uploaded_file(file, subfolder="resumes", save_to_db=True)
        file_extension = file.filename.split('.')[-1]
        
        # Save file temporarily for parsing (parser needs file path)
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as tmp_file:
            tmp_file.write(file_content)
            file_path = tmp_file.name
        
        try:
            # Prepare form data for parser
            form_data = {
                'fullName': fullName,
                'email': email,
                'phone': phone,
                'experience': experience,
                'skills': skills,
                'location': location,
                'role': role,
                'education': education,
                'experiences': experiences,
                'noticePeriod': noticePeriod,
                'currentlyWorking': currentlyWorking,
                'currentCompany': currentCompany,
                'readyToRelocate': readyToRelocate,
                'preferredLocation': preferredLocation
            }
            
            # Parse resume (parse_resume service now handles the robust merging)
            logger.info(f"Parsing user resume: {file.filename}")
            parsed_data = await parse_resume(file_path, file_extension, form_data=form_data)
            
            # Clean null bytes from parsed data
            parsed_data = clean_dict_values(parsed_data)
            
            # Check for duplicate by email
            resume_email = parsed_data.get('resume_contact_info') or uploader_email
            existing_resume = None
            if resume_email:
                stmt = select(Resume).where(Resume.parsed_data['resume_contact_info'].astext == resume_email)
                result = await db.execute(stmt)
                existing_resume = result.scalar_one_or_none()

            source_metadata = {
                'user_type': userType,
                'form_data': {
                    'fullName': clean_null_bytes(fullName) if fullName else None,
                    'email': clean_null_bytes(email) if email else uploader_email,
                    'phone': clean_null_bytes(phone) if phone else None,
                    'experience': clean_null_bytes(experience) if experience else None,
                    'skills': clean_null_bytes(skills) if skills else None,
                    'location': clean_null_bytes(location) if location else None,
                    'role': clean_null_bytes(role) if role else None,
                    'education': clean_null_bytes(education) if education else None,
                    'noticePeriod': noticePeriod,
                    'currentlyWorking': currentlyWorking,
                    'currentCompany': clean_null_bytes(currentCompany) if currentCompany else None,
                    'readyToRelocate': readyToRelocate,
                    'preferredLocation': clean_null_bytes(preferredLocation) if preferredLocation else None,
                    'linkedIn': clean_null_bytes(linkedIn) if linkedIn else None,
                    'portfolio': clean_null_bytes(portfolio) if portfolio else None
                }
            }
            
            meta_data = {
                'parsing_method': parsed_data.get('parsing_method', 'unknown'),
                'file_size': len(file_content),
                'user_type': userType or 'Guest',
                'user_profile': {
                    'fullName': clean_null_bytes(fullName) if fullName else None,
                    'email': clean_null_bytes(email) if email else uploader_email,
                    'phone': clean_null_bytes(phone) if phone else None,
                    'experience': clean_null_bytes(experience) if experience else None,
                    'skills': clean_null_bytes(skills) if skills else None,
                    'location': clean_null_bytes(location) if location else None,
                    'notice_period': noticePeriod,
                    'currently_working': currentlyWorking,
                    'current_company': clean_null_bytes(currentCompany) if currentCompany else None,
                    'ready_to_relocate': readyToRelocate,
                    'preferred_location': clean_null_bytes(preferredLocation) if preferredLocation else None
                }
            }

            if existing_resume:
                logger.info(f"Updating existing resume for {resume_email} (ID: {existing_resume.id})")
                existing_resume.filename = file.filename
                existing_resume.file_url = file_url  # Will be updated with actual resume_id after save
                existing_resume.file_content = file_content  # Store file in database
                existing_resume.file_mime_type = mime_type
                existing_resume.source_type = source_type
                existing_resume.source_metadata = source_metadata
                existing_resume.raw_text = clean_null_bytes(parsed_data.get('raw_text', ''))
                existing_resume.parsed_data = parsed_data
                existing_resume.skills = parsed_data.get('all_skills', parsed_data.get('resume_technical_skills', []))
                existing_resume.experience_years = parsed_data.get('resume_experience', 0)
                existing_resume.uploaded_by = uploader_email
                existing_resume.uploaded_at = datetime.utcnow()
                existing_resume.meta_data = meta_data
                existing_resume.meta_data['is_update'] = True
                resume = existing_resume
            else:
                # Create new resume record with file_content
                resume = Resume(
                    filename=file.filename,
                    file_url=file_url,  # Will be updated with actual resume_id after save
                    file_content=file_content,  # Store file in database
                    file_mime_type=mime_type,
                    source_type=source_type,
                    source_id=None,
                    source_metadata=source_metadata,
                    raw_text=clean_null_bytes(parsed_data.get('raw_text', '')),
                    parsed_data=parsed_data,
                    skills=parsed_data.get('all_skills', parsed_data.get('resume_technical_skills', [])),
                    experience_years=parsed_data.get('resume_experience', 0),
                    uploaded_by=uploader_email,
                    meta_data=meta_data
                )
                db.add(resume)
            
            await db.commit()
            await db.refresh(resume)
            
            # Update file_url with actual resume_id
            resume.file_url = f"/api/resumes/{resume.id}/file"
            await db.commit()
        finally:
            # Clean up temporary file
            if os.path.exists(file_path):
                try:
                    os.unlink(file_path)
                except:
                    pass
        
        # Parse education JSON if provided
        education_data = None
        if education:
            import json
            try:
                education_data = json.loads(education) if isinstance(education, str) else education
            except (json.JSONDecodeError, TypeError):
                # If not JSON, treat as single string
                education_data = education
        
        # Parse experiences JSON if provided
        experiences_data = None
        if experiences:
            import json
            try:
                experiences_data = json.loads(experiences) if isinstance(experiences, str) else experiences
            except (json.JSONDecodeError, TypeError):
                # If not JSON, skip (experiences should be structured)
                experiences_data = None
        
        # Save structured data (Experience/Certification/Education)
        await save_structured_resume_data(db, resume.id, parsed_data, clear_existing=True, form_education=education_data, form_experiences=experiences_data)
        await db.commit()

        # If jobId provided (career page application), create JobApplication record
        job_id = (jobId or "").strip()
        if job_id:
            try:
                # Verify job exists in job_openings and get title to store
                job_result = await db.execute(select(JobOpening).where(JobOpening.job_id == job_id))
                job_opening = job_result.scalar_one_or_none()
                if job_opening:
                    applicant_name = fullName or parsed_data.get('resume_candidate_name')
                    applicant_email = email or uploader_email or parsed_data.get('resume_contact_info')
                    job_app = JobApplication(
                        job_id=job_id,
                        job_title=job_opening.title,
                        resume_id=resume.id,
                        applicant_name=applicant_name,
                        applicant_email=applicant_email,
                        applied_at=datetime.utcnow()
                    )
                    db.add(job_app)
                    await db.commit()
                    logger.info(f"JobApplication created: job_id={job_id}, job_title={job_opening.title}, resume_id={resume.id}")
                else:
                    logger.warning(f"job_id {job_id} not found in job_openings, skipping JobApplication")
            except Exception as job_err:
                # UniqueConstraint violation (duplicate) - resume already applied for this job
                await db.rollback()
                logger.info(f"JobApplication skipped (likely duplicate): {job_err}")
        
        logger.info(f"Successfully processed user profile resume: {file.filename}")
        
        return {
            'success': True,
            'message': 'Resume processed successfully',
            'resume_id': resume.id,
            'is_update': existing_resume is not None,
            'filename': resume.filename,
            'candidate_name': parsed_data.get('resume_candidate_name', 'Unknown'),
            'skills': resume.skills
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload user profile resume error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
