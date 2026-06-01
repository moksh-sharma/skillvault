from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, Form, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
from src.models.jd_analysis import JDAnalysis, MatchResult
from src.models.resume import Resume
from src.models.user_db import User
from src.config.database import get_postgres_db
from src.middleware.auth_middleware import get_admin_user, get_current_user
from src.services.storage import save_uploaded_file
from src.services.file_processor import extract_text_from_file
from src.services import openai_service
from src.services.matching_engine import calculate_match_score, calculate_traditional_score
from src.utils.validators import validate_file_type
from src.utils.logger import get_logger
from src.utils.user_type_mapper import normalize_user_type, get_user_type_from_source_type, get_source_type_from_user_type
from src.utils.response_formatter import format_resume_response
from src.config.settings import settings
import asyncio
import hashlib
import json
import re

logger = get_logger(__name__)
router = APIRouter(prefix="/api/jd", tags=["JD Analysis"])

ALLOWED_EXTENSIONS = ['pdf', 'docx']

# Bump when response payload/scoring inputs/logic change to avoid stale cache rows.
# v2.4: Structure-aware cache key (jd_structure_hash) - cache now includes dimensions + weights
JD_MATCH_ENGINE_VERSION = "v2.4"

def fix_file_url(url: str) -> str:
    """Helper to fix relative file URLs for frontend consumption."""
    if url and url.startswith('/'):
        # Use simple localhost construction as fallback
        return f"http://localhost:{settings.port}{url}"
    return url


def _heuristic_jd_structure_v2(jd_text: str, dims: list) -> dict:
    """
    Fallback JD "structure" extractor when Ollama/LLM is unavailable.

    Produces a minimal schema compatible with v2 pipeline:
    - selected_dimensions: chosen by seed skill overlap with JD text
    - required/preferred skills: drawn from dimension seed skills present in JD text
    """
    text = " ".join((jd_text or "").lower().split())

    # crude min experience extraction (e.g. "3 years", "5+ years")
    min_exp = 0
    m = re.search(r"(\d{1,2})\s*\+?\s*(?:years|yrs)\b", text)
    if m:
        try:
            min_exp = int(m.group(1))
        except Exception:
            min_exp = 0

    selected = []
    for d in dims:
        seed = list(d.seed_skills) if getattr(d, "seed_skills", None) else []
        hit = []
        for s in seed:
            if not s:
                continue
            key = str(s).strip().lower()
            if not key:
                continue
            # match whole-ish words
            if re.search(rf"(^|[^a-z0-9]){re.escape(key)}([^a-z0-9]|$)", text):
                hit.append(str(s).strip())

        if hit:
            # Use hit skills as required skills for that dimension
            selected.append(
                {
                    "dimension_id": d.id,
                    "required_skills": hit[:15],
                    "preferred_skills": [],
                    "confidence": "medium",
                }
            )

    # If nothing matched, fall back to first few dims so scoring still returns something
    if not selected:
        selected = [
            {
                "dimension_id": d.id,
                "required_skills": [],
                "preferred_skills": [],
                "confidence": "none",
            }
            for d in (dims[:4] if dims else [])
        ]

    return {
        "jd_role": "Not mentioned",
        "min_experience_years": min_exp,
        "selected_dimensions": selected,
    }

@router.post("/analyze")
async def analyze_jd(
    file: Optional[UploadFile] = File(None),
    jd_text_manual: Optional[str] = Form(None),
    min_score: int = Query(10, ge=0, le=100, description="Minimum match score threshold"),
    top_n: int = Query(10, ge=1, le=50, description="Number of top candidates to return"),
    user_types: Optional[List[str]] = Query(None, description="Filter by source types"),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Upload JD file or provide JD text and get top matching candidates
    """
    try:
        jd_text = ""
        jd_filename = "Manual Entry"
        
        if file and file.filename:
            # Step 1: Validate file type
            if not validate_file_type(file.filename, ALLOWED_EXTENSIONS):
                raise HTTPException(status_code=400, detail=f"Invalid file type. Only {', '.join([e.upper() for e in ALLOWED_EXTENSIONS])} allowed.")
            
            # Step 2: Save JD file
            logger.info(f"Saving JD file: {file.filename}")
            # JD files don't need database storage, just filesystem storage
            file_path, file_url, file_content, mime_type = await save_uploaded_file(file, subfolder="jd", save_to_db=False)
            file_extension = file.filename.split('.')[-1]
            jd_filename = file.filename
            
            # Step 3: Extract text from JD
            logger.info("Extracting text from JD")
            jd_text = extract_text_from_file(file_path, file_extension)
        elif jd_text_manual:
            logger.info("Using manual JD text entry")
            jd_text = jd_text_manual.strip()
            jd_filename = "Manual Entry"
            
        if not jd_text:
            logger.error(f"No JD text found. manual_entry_len: {len(jd_text_manual) if jd_text_manual else 0}")
            raise HTTPException(status_code=400, detail="Please provide either a JD file or JD text")
        
        logger.info(f"Proceeding with JD text (length: {len(jd_text)})")
        
        # Step 4: Extract JD requirements using Ollama
        logger.info("Analyzing JD with Ollama")
        try:
            # Check if AI backend is available before attempting extraction
            from src.services.openai_service import get_openai_client
            client = get_openai_client()
            if not client:
                logger.error("Ollama client not initialized")
                raise HTTPException(
                    status_code=500, 
                    detail="Ollama is not configured. Please set OLLAMA_BASE_URL and OLLAMA_MODEL in your environment variables."
                )
            
            jd_requirements = await openai_service.extract_jd_requirements(jd_text)
            # Ensure all required fields exist with defaults
            if not jd_requirements:
                raise HTTPException(status_code=500, detail="Failed to extract JD requirements: Empty response from Ollama")
            # Set defaults for missing fields
            jd_requirements.setdefault('required_skills', [])
            jd_requirements.setdefault('preferred_skills', [])
            jd_requirements.setdefault('keywords', [])
            jd_requirements.setdefault('min_experience_years', 0)
            jd_requirements.setdefault('education', '')
            jd_requirements.setdefault('job_level', 'Experienced')
            logger.info(f"JD requirements extracted successfully. Required skills: {len(jd_requirements.get('required_skills', []))}")
        except HTTPException:
            raise
        except ValueError as ve:
            logger.error(f"Ollama configuration error: {ve}")
            raise HTTPException(status_code=500, detail=f"Ollama service not configured: {str(ve)}")
        except Exception as e:
            logger.error(f"Failed to extract JD requirements: {e}", exc_info=True)
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"Full traceback: {error_trace}")
            raise HTTPException(status_code=500, detail=f"Failed to analyze JD with Ollama: {str(e)}")
        
        # Step 5: Generate unique job ID
        job_id = f"JOB-{uuid.uuid4().hex[:8].upper()}"
        
        # Step 6: Save JD analysis to database
        try:
            jd_analysis = JDAnalysis(
                job_id=job_id,
                jd_filename=jd_filename,
                jd_text=jd_text,
                extracted_keywords=jd_requirements.get('keywords', []),
                required_skills=jd_requirements.get('required_skills', []),
                preferred_skills=jd_requirements.get('preferred_skills', []),
                required_experience=jd_requirements.get('min_experience_years', 0),
                education=jd_requirements.get('education', ''),
                job_level=jd_requirements.get('job_level', ''),
                submitted_by=current_user['email']
            )
            
            db.add(jd_analysis)
            await db.commit()
            
            logger.info(f"JD analysis saved with job_id: {job_id}")
        except Exception as db_error:
            logger.error(f"Failed to save JD analysis to database: {db_error}", exc_info=True)
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to save JD analysis: {str(db_error)}")
        
        # Step 7: Fetch all resumes from database (filter by source_type if provided)
        logger.info("Fetching all resumes for matching")
        query = select(Resume).options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations)
        )
        if user_types and len(user_types) > 0:
            # Map user_types to source_types
            source_types = [get_source_type_from_user_type(normalize_user_type(ut)) for ut in user_types]
            query = query.where(Resume.source_type.in_(source_types))
        result = await db.execute(query)
        all_resumes = result.scalars().all()
        total_resumes = len(all_resumes)
        
        logger.info(f"Found {total_resumes} resumes to match against.")
        logger.info(f"JD Requirements: Skills={len(jd_requirements.get('required_skills', []))}, Keywords={len(jd_requirements.get('keywords', []))}")
        
        # Step 8: Calculate match scores using two-phase concurrency and caching
        matches = []
        existing_results_query = select(MatchResult).where(MatchResult.job_id == job_id)
        existing_results_result = await db.execute(existing_results_query)
        existing_results_list = existing_results_result.scalars().all()
        existing_results = {mr.resume_id: mr for mr in existing_results_list}

        # Phase 1: Traditional scoring for all resumes (fast)
        prelim = []
        for resume in all_resumes:
            try:
                parsed = resume.parsed_data or {}
                # Fallback strategy: Clean skills
                extracted_skills = resume.skills or parsed.get('resume_technical_skills', []) or parsed.get('all_skills', [])
                if isinstance(extracted_skills, str):
                    extracted_skills = [s.strip() for s in extracted_skills.split(',') if s.strip()]
                    
                resume_data = {
                    'skills': extracted_skills,
                    'experience_years': resume.experience_years if resume.experience_years is not None else (parsed.get('resume_experience') or 0),
                    'raw_text': resume.raw_text or '',
                    'summary': parsed.get('summary', '') or (resume.raw_text[:500] if resume.raw_text else ''),
                    'education': f"{parsed.get('resume_degree', 'Not mentioned')} - {parsed.get('resume_university', 'Not mentioned')}",
                    'role': parsed.get('resume_role', getattr(resume, 'job_title', 'Not mentioned')), # Removed resume.role, checking job_title just in case
                    'certifications': parsed.get('resume_certificates', [])
                }
                
                # HARD FILTER: Check minimum experience requirement
                min_exp_required = jd_requirements.get('min_experience_years', 0)
                candidate_exp = resume_data['experience_years']
                
                if min_exp_required > 0 and candidate_exp < min_exp_required:
                    # Skip candidates who don't meet minimum experience
                    logger.debug(f"Resume {resume.id} filtered out: {candidate_exp} years < {min_exp_required} years required")
                    continue
            
                score = calculate_traditional_score(resume_data, jd_requirements)
                # LOGGING: Check why score might be low
                if score == 0:
                     logger.debug(f"Resume {resume.id} score 0. Data: Skills={len(resume_data['skills'])}, Exp={resume_data['experience_years']}")

                if score >= min_score:
                    prelim.append((resume, resume_data, score))
            except Exception as e:
                logger.error(f"Scoring/Processing failed for resume {resume.id}: {e}")

        logger.info(f"{len(prelim)}/{total_resumes} resumes passed minimum score {min_score} in phase 1")

        if len(prelim) < 5:
            logger.info("Phase 1 yielded too few results. Relaxing filter to include top potential candidates.")
            all_scored = []
            for resume in all_resumes:
                try:
                    parsed = resume.parsed_data or {}
                    extracted_skills = resume.skills or parsed.get('resume_technical_skills', []) or parsed.get('all_skills', [])
                    if isinstance(extracted_skills, str):
                        extracted_skills = [s.strip() for s in extracted_skills.split(',') if s.strip()]
                    resume_data = {
                        'skills': extracted_skills,
                        'experience_years': resume.experience_years if resume.experience_years is not None else (parsed.get('resume_experience') or 0),
                        'raw_text': resume.raw_text or '',
                        'summary': parsed.get('summary', '') or (resume.raw_text[:500] if resume.raw_text else ''),
                        'education': f"{parsed.get('resume_degree', 'Not mentioned')} - {parsed.get('resume_university', 'Not mentioned')}",
                        'role': parsed.get('resume_role', getattr(resume, 'job_title', 'Not mentioned')),
                        'certifications': parsed.get('resume_certificates', [])
                    }
                    
                    # HARD FILTER: Check minimum experience requirement (same as Phase 1)
                    min_exp_required = jd_requirements.get('min_experience_years', 0)
                    candidate_exp = resume_data['experience_years']
                    
                    if min_exp_required > 0 and candidate_exp < min_exp_required:
                        # Skip candidates who don't meet minimum experience
                        continue
                    
                    score = calculate_traditional_score(resume_data, jd_requirements)
                    all_scored.append((resume, resume_data, score))
                except Exception: continue
            all_scored.sort(key=lambda x: x[2], reverse=True)
            prelim = all_scored[:15]
            logger.info(f"Fallback: Passing top {len(prelim)} candidates to AI matching.")

        # Phase 2: Prepare data COMPLETELY DETACHED from DB session
        logger.info("Starting Phase 2: preparing detached data")
        try:
            # Convert all resume objects to plain dictionaries to avoid greenlet issues
            prelim_data = []
            
            # Pre-fetch user data for relocation stats
            emails = [r[0].uploaded_by for r in prelim if r[0].uploaded_by]
            user_map = {}
            if emails:
                try:
                    user_query = select(User).where(User.email.in_(emails))
                    user_result = await db.execute(user_query)
                    users_list = user_result.scalars().all()
                    user_map = {u.email.lower(): u for u in users_list}
                except Exception as e:
                    logger.warning(f"Failed to fetch user details: {e}")

            for resume, resume_data, score in prelim:
                try:
                    # format_resume_response creates a detached dictionary with all frontend fields
                    # Since we used selectinload, this is safe to call here
                    detached_data = format_resume_response(resume)
                    
                    # Add relocation info from User table
                    user = user_map.get(resume.uploaded_by.lower()) if resume.uploaded_by else None
                    if user:
                        detached_data['ready_to_relocate'] = user.ready_to_relocate
                        detached_data['preferred_location'] = user.preferred_location
                        detached_data['notice_period'] = user.notice_period
                    else:
                        meta = resume.meta_data or {}
                        user_prof = meta.get('user_profile', {})
                        detached_data['ready_to_relocate'] = meta.get('ready_to_relocate', False)
                        detached_data['preferred_location'] = user_prof.get('location', 'Not mentioned')
                        detached_data['notice_period'] = meta.get('notice_period', 0)

                    # Map resume_id consistently for downstream matching
                    detached_data['resume_id'] = resume.id
                    detached_data['source_type'] = resume.source_type
                    detached_data['source_id'] = resume.source_id
                    
                    # Add fields specifically needed for UniversalFitScorer (mapping from parsed_data or resume_data)
                    parsed = resume.parsed_data or {}
                    detached_data.update({
                        'resume_candidate_name': detached_data.get('name'),
                        'resume_role': detached_data.get('role'),
                        'resume_experience': detached_data.get('experience_years', 0),
                        'resume_degree': parsed.get('resume_degree', 'Not mentioned'),
                        'resume_university': parsed.get('resume_university', 'Not mentioned'),
                        'resume_location': detached_data.get('location'),
                        'resume_technical_skills': detached_data.get('skills', []),
                        'resume_certificates': parsed.get('resume_certificates', []),
                        'resume_achievements': parsed.get('resume_achievements', []),
                        'raw_text': resume.raw_text or '',
                        'summary': parsed.get('summary', '') or (resume.raw_text[:500] if resume.raw_text else '')
                    })
                    
                    # Ensure we don't lose the pre-calculated resume_data (skills, etc.)
                    detached_data.update(resume_data)
                    
                    prelim_data.append(detached_data)
                except Exception as ie:
                    logger.error(f"Error preparing resume {resume.id}: {ie}")
                    continue
            
            logger.info(f"Phase 2 complete: Prepared {len(prelim_data)} items for AI analysis")
            
        except Exception as e:
             logger.error(f"Phase 2 processing failed: {e}")
             raise e
        
        # Phase 3: AI-enhanced scoring with DETACHED data (no DB session access)
        semaphore = asyncio.Semaphore(max(1, settings.ollama_max_parallel))
        async def score_resume(detached_data):
            try:
                resume_id = detached_data['resume_id']
                
                # Use cached result if already computed
                cached = existing_results.get(resume_id)
                if cached:
                    return {
                        **detached_data,
                        'match_score': cached.match_score,
                        'skill_match': cached.skill_match_score,
                        'experience_match': cached.experience_match_score,
                        'semantic_score': cached.semantic_score,
                        'matched_skills': cached.keyword_matches.get('matched_skills', []) if cached.keyword_matches else [],
                        'missing_skills': cached.keyword_matches.get('missing_skills', []) if cached.keyword_matches else [],
                        'match_explanation': cached.match_explanation,
                        'candidate_name': detached_data.get('name')
                    }, False
                
                # Calculate match score with rate limit handling
                async with semaphore:
                    try:
                        score_result = await calculate_match_score(detached_data, jd_requirements)
                        logger.debug(f"Resume {resume_id} scored successfully: {score_result.get('total_score', 0)}")
                    except Exception as e:
                        # Check if it's a rate limit error or TypeError (certifications issue)
                        error_str = str(e).lower()
                        error_type = type(e).__name__
                        
                        if 'rate limit' in error_str or '429' in error_str or 'rate_limit' in error_str:
                            logger.warning(f"Rate limit hit for resume {resume_id}, using fallback scoring")
                        elif error_type == 'TypeError' and ('sequence item' in error_str or 'certification' in error_str):
                            logger.warning(f"TypeError in scoring for resume {resume_id} (likely certifications issue), using fallback scoring: {e}")
                        else:
                            logger.warning(f"Error in scoring for resume {resume_id}: {error_type}: {e}, using fallback scoring")
                        
                        # Fall back to traditional scoring for any error
                        from src.services.matching_engine import _calculate_traditional_fallback
                        score_result = _calculate_traditional_fallback(detached_data, jd_requirements)
                        logger.debug(f"Resume {resume_id} fallback score: {score_result.get('total_score', 0)}")
                    
                    return {
                        **detached_data,
                        'match_score': score_result['total_score'],
                        'skill_match': score_result['skill_match'],
                        'experience_match': score_result['experience_match'],
                        'semantic_score': score_result['semantic_score'],
                        'matched_skills': score_result['matched_skills'],
                        'missing_skills': score_result['missing_skills'],
                        'match_explanation': score_result['match_explanation'],
                        'learning_agility_score': score_result.get('learning_agility_score', 0.0),
                        'domain_context_score': score_result.get('domain_context_score', 0.0),
                        'communication_score': score_result.get('communication_score', 0.0),
                        'factor_breakdown': score_result.get('factor_breakdown', {}),
                        'candidate_name': detached_data.get('name')
                    }, True
            except Exception as e:
                logger.error(f"Critical error matching resume {detached_data.get('resume_id')}: {e}, using fallback")
                # Even on critical errors, try fallback scoring
                try:
                    from src.services.matching_engine import _calculate_traditional_fallback
                    score_result = _calculate_traditional_fallback(detached_data, jd_requirements)
                    return {
                        **detached_data,
                        'match_score': score_result['total_score'],
                        'skill_match': score_result['skill_match'],
                        'experience_match': score_result['experience_match'],
                        'semantic_score': score_result['semantic_score'],
                        'matched_skills': score_result['matched_skills'],
                        'missing_skills': score_result['missing_skills'],
                        'match_explanation': score_result['match_explanation'],
                        'learning_agility_score': score_result.get('learning_agility_score', 0.0),
                        'domain_context_score': score_result.get('domain_context_score', 0.0),
                        'communication_score': score_result.get('communication_score', 0.0),
                        'factor_breakdown': score_result.get('factor_breakdown', {}),
                        'candidate_name': detached_data.get('name')
                    }, True
                except Exception as fallback_error:
                    logger.error(f"Fallback scoring also failed for resume {detached_data.get('resume_id')}: {fallback_error}")
                    return None, False

        # Run scoring tasks with detached data (NO database access here)
        tasks = [score_resume(data) for data in prelim_data]
        results = await asyncio.gather(*tasks)

        for result, should_persist in results:
            if not result:
                continue
            # Log the score for debugging
            score = result.get('match_score', 0)
            logger.info(f"Resume {result.get('resume_id')} scored {score} (threshold: {min_score})")
            
            if result['match_score'] >= min_score:
                matches.append(result)
                if should_persist:
                    # Truncate all String(100) fields to avoid database errors
                    # Database columns are VARCHAR(100), so we truncate to 95 to be safe
                    match_explanation = result.get('match_explanation', '')
                    if match_explanation and len(match_explanation) > 95:
                        match_explanation = match_explanation[:92] + "..."
                    
                    # Truncate job_id if needed (shouldn't be necessary, but safe)
                    safe_job_id = job_id[:95] if len(job_id) > 95 else job_id
                    
                    # Truncate source_id if needed
                    source_id = result.get('source_id')
                    safe_source_id = None
                    if source_id:
                        safe_source_id = source_id[:95] if len(str(source_id)) > 95 else source_id
                    
                    try:
                        db.add(MatchResult(
                            job_id=safe_job_id,
                            resume_id=result['resume_id'],
                            source_type=result.get('source_type'),
                            source_id=safe_source_id,
                            # Legacy fields (for backward compatibility)
                            match_score=result['match_score'],
                            skill_match_score=result['skill_match'],
                            experience_match_score=result['experience_match'],
                            semantic_score=result['semantic_score'],
                            keyword_matches={
                                'matched_skills': result['matched_skills'],
                                'missing_skills': result['missing_skills']
                            },
                            match_explanation=match_explanation,
                            # NEW: Universal Fit Score fields
                            universal_fit_score=result['match_score'],
                            skill_evidence_score=result['skill_match'],
                            execution_score=result['experience_match'],
                            complexity_score=result['semantic_score'],
                            learning_agility_score=result.get('learning_agility_score', 0.0),
                            domain_context_score=result.get('domain_context_score', 0.0),
                            communication_score=result.get('communication_score', 0.0),
                            factor_breakdown=result.get('factor_breakdown', {})
                        ))
                    except Exception as db_add_error:
                        logger.error(f"Error adding MatchResult to database: {db_add_error}")
                        logger.error(f"job_id length: {len(safe_job_id)}, source_id length: {len(str(safe_source_id)) if safe_source_id else 0}, match_explanation length: {len(match_explanation)}")
                        raise
            else:
                logger.debug(f"Resume {result.get('resume_id')} filtered out: score {score} < {min_score}")

        await db.commit()
        
        # Step 9: Sort by score and return top N
        matches.sort(key=lambda x: x['match_score'], reverse=True)
        
        # If no matches meet the threshold, include top candidates anyway (with lower threshold)
        if len(matches) == 0:
            logger.warning(f"No candidates met minimum score {min_score}. Including top candidates with lower scores.")
            # Get all valid results and sort by score
            valid_results = [r for r, _ in results if r is not None]
            if valid_results:
                valid_results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
                # Include top candidates even if below threshold
                matches = valid_results[:top_n]
                logger.info(f"Including {len(matches)} top candidates despite low scores (scores: {[r.get('match_score', 0) for r in matches[:5]]})")
            else:
                logger.error(f"No valid results found! Total results: {len(results)}, None results: {sum(1 for r, _ in results if r is None)}")
        
        top_matches = matches[:top_n]
        
        logger.info(f"JD Analysis complete: {len(matches)} matches found, returning top {len(top_matches)}")
        
        return {
            'job_id': job_id,
            'jd_filename': jd_filename,
            'total_resumes_analyzed': total_resumes,
            'total_matches': len(matches),
            'min_score_threshold': min_score,
            'jd_requirements': {
                'required_skills': jd_requirements.get('required_skills', []),
                'preferred_skills': jd_requirements.get('preferred_skills', []),
                'min_experience_years': jd_requirements.get('min_experience_years', 0),
                'education': jd_requirements.get('education', ''),
                'job_level': jd_requirements.get('job_level', '')
            },
            'top_matches': top_matches
        }
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"JD Analysis error: {e}")
        logger.error(f"Full traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"JD Analysis failed: {str(e)}")


@router.post("/analyze-v2")
async def analyze_jd_v2(
    file: Optional[UploadFile] = File(None),
    jd_text_manual: Optional[str] = Form(None),
    min_score: int = Query(10, ge=0, le=100, description="Minimum match score threshold"),
    top_n: int = Query(10, ge=1, le=50, description="Number of top candidates to return"),
    user_types: Optional[List[str]] = Query(None, description="Filter by source types"),
    current_user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_postgres_db),
):
    """
    V2: JD vs multi-resume scoring engine (ChatGPT-like output, deterministic scoring).

    - Dimensions are selected ONLY from backend dimension library (GPT cannot invent).
    - Confidence labels are extracted by GPT; backend assigns weights and scores deterministically.
    - Explanations are deterministic (no GPT).
    """
    try:
        # -----------------------------
        # 1) Get JD text (file or manual)
        # -----------------------------
        jd_text = ""
        jd_filename = "Manual Entry"

        if file and file.filename:
            if not validate_file_type(file.filename, ALLOWED_EXTENSIONS):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file type. Only {', '.join([e.upper() for e in ALLOWED_EXTENSIONS])} allowed.",
                )
            logger.info(f"[v2] Saving JD file: {file.filename}")
            file_path, _, _, _ = await save_uploaded_file(file, subfolder="jd", save_to_db=False)
            file_extension = file.filename.split(".")[-1]
            jd_filename = file.filename
            jd_text = extract_text_from_file(file_path, file_extension)
        elif jd_text_manual:
            jd_text = jd_text_manual.strip()
            jd_filename = "Manual Entry"

        if not jd_text:
            raise HTTPException(status_code=400, detail="Please provide either a JD file or JD text")

        # Normalize + hash for caching (jd_hash + resume_id)
        normalized_jd_text = " ".join(jd_text.split())
        jd_hash = hashlib.sha256(normalized_jd_text.encode("utf-8")).hexdigest()

        # Ensure a canonical JDAnalysis row exists for this jd_hash (required for FK in match_results).
        jd_existing_result = await db.execute(select(JDAnalysis).where(JDAnalysis.jd_hash == jd_hash))
        jd_existing = jd_existing_result.scalar_one_or_none()
        if jd_existing:
            job_id = jd_existing.job_id
        else:
            # Stable job_id derived from hash (<= 100 chars)
            job_id = f"JDHASH-{jd_hash[:24].upper()}"
            jd_existing = JDAnalysis(
                job_id=job_id,
                jd_hash=jd_hash,
                jd_filename=jd_filename,
                jd_text=jd_text,
                extracted_keywords=[],
                required_skills=[],
                preferred_skills=[],
                required_experience=0.0,
                education="",
                job_level="",
                submitted_by=current_user.get("email"),
            )
            db.add(jd_existing)
            await db.commit()

        # -----------------------------
        # 2) Load backend dimension library and extract JD structure (GPT)
        # -----------------------------
        from src.services.dimension_library import get_dimension_library

        dims = get_dimension_library()
        dim_lib_payload = [
            {
                "id": d.id,
                "label": d.label,
                "definition": d.definition,
                "seed_skills": list(d.seed_skills) if d.seed_skills else [],
            }
            for d in dims
        ]
        dim_labels = {d.id: d.label for d in dims}

        # LLM step (Ollama) - fall back to heuristic extraction if unavailable
        try:
            jd_struct = await openai_service.extract_jd_structure_v2(jd_text, dim_lib_payload)
        except Exception as e:
            logger.warning(
                "[v2] Ollama unavailable for JD extraction; using heuristic fallback. "
                "%s: %s",
                type(e).__name__,
                e or "(no message)",
            )
            jd_struct = _heuristic_jd_structure_v2(jd_text, dims)

        jd_role = jd_struct.get("jd_role", "Not mentioned")
        min_experience_years = jd_struct.get("min_experience_years", 0) or 0
        selected_dimensions = jd_struct.get("selected_dimensions", []) or []
        selected_dim_ids = [d.get("dimension_id") for d in selected_dimensions if isinstance(d, dict) and d.get("dimension_id")]

        # Aggregate required/preferred skills across dimensions
        jd_required_skills = []
        jd_preferred_skills = []
        for d in selected_dimensions:
            jd_required_skills.extend((d.get("required_skills") or []) if isinstance(d, dict) else [])
            jd_preferred_skills.extend((d.get("preferred_skills") or []) if isinstance(d, dict) else [])

        # Deduplicate while preserving first-seen order
        def _dedupe(seq):
            seen = set()
            out = []
            for item in seq:
                if not isinstance(item, str):
                    continue
                s = item.strip()
                if not s:
                    continue
                key = s.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(s)
            return out

        jd_required_skills = _dedupe(jd_required_skills)
        jd_preferred_skills = _dedupe(jd_preferred_skills)

        # Update canonical JDAnalysis row with extracted JD summary (best-effort)
        try:
            jd_existing.jd_filename = jd_filename
            jd_existing.jd_text = jd_text
            jd_existing.required_experience = float(min_experience_years or 0)
            jd_existing.required_skills = jd_required_skills
            jd_existing.preferred_skills = jd_preferred_skills
            jd_existing.extracted_keywords = _dedupe(jd_required_skills + jd_preferred_skills)
            jd_existing.job_level = jd_role
            await db.commit()
        except Exception:
            await db.rollback()

        # -----------------------------
        # 3) Backend deterministic weights (stable)
        # -----------------------------
        from src.services.weighting_v2 import assign_equal_weights

        weights = assign_equal_weights(selected_dim_ids)

        # -----------------------------
        # 3.5) Create structure-aware cache key
        # -----------------------------
        # Cache key must include JD structure (dimensions + weights), not just text hash.
        # This ensures cache is invalidated when JD structure changes, preventing stale scores.
        dims_sorted = sorted(selected_dim_ids)
        weights_str = json.dumps(
            {k: weights.get(k) for k in dims_sorted},
            sort_keys=True
        )
        jd_structure_hash = hashlib.sha256(
            f"{jd_hash}:{weights_str}".encode("utf-8")
        ).hexdigest()[:16]

        # Log structure hash for debugging score variance
        logger.info(
            f"[v2] JD structure hash: {jd_structure_hash[:8]}... "
            f"(dims: {len(selected_dim_ids)}, dim_ids: {sorted(selected_dim_ids)}, total_weight: {sum(weights.values())})"
        )

        # -----------------------------
        # 4) Fetch resumes (optionally filtered)
        # -----------------------------
        logger.info("[v2] Fetching resumes for matching")
        query = select(Resume).options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations),
        )
        if user_types and len(user_types) > 0:
            source_types = [get_source_type_from_user_type(normalize_user_type(ut)) for ut in user_types]
            query = query.where(Resume.source_type.in_(source_types))
        result = await db.execute(query)
        all_resumes = result.scalars().all()
        total_resumes = len(all_resumes)

        # -----------------------------
        # 5) Phase-1 shortlist (fast) using existing traditional scoring
        # -----------------------------
        # Build a flat requirements object compatible with existing phase-1 scorer
        jd_requirements_flat = {
            "required_skills": jd_required_skills,
            "preferred_skills": jd_preferred_skills,
            "keywords": _dedupe(jd_required_skills + jd_preferred_skills),
            "min_experience_years": float(min_experience_years or 0),
        }

        prelim = []
        for resume in all_resumes:
            try:
                parsed = resume.parsed_data or {}
                extracted_skills = resume.skills or parsed.get("resume_technical_skills", []) or parsed.get("all_skills", [])
                if isinstance(extracted_skills, str):
                    extracted_skills = [s.strip() for s in extracted_skills.split(",") if s.strip()]

                resume_data = {
                    "skills": extracted_skills,
                    "experience_years": resume.experience_years if resume.experience_years is not None else (parsed.get("resume_experience") or 0),
                    "raw_text": resume.raw_text or "",
                    "summary": parsed.get("summary", "") or (resume.raw_text[:500] if resume.raw_text else ""),
                    "certifications": parsed.get("resume_certificates", []),
                }

                # Hard filter experience
                if jd_requirements_flat["min_experience_years"] > 0 and resume_data["experience_years"] < jd_requirements_flat["min_experience_years"]:
                    continue

                score = calculate_traditional_score(resume_data, jd_requirements_flat)
                if score >= min_score:
                    prelim.append((resume, resume_data, score))
            except Exception as e:
                logger.debug(f"[v2] Phase-1 scoring failed for resume {getattr(resume, 'id', None)}: {e}")

        prelim.sort(key=lambda x: x[2], reverse=True)
        if len(prelim) < 5:
            prelim = prelim[:15]  # relax threshold: keep top few candidates
        else:
            prelim = prelim[: min(len(prelim), 25)]

        # Cache lookup for shortlist by (jd_structure_hash, resume_id) and matching engine version
        # NOTE: Using jd_structure_hash (not jd_hash) ensures cache is structure-aware.
        # Same JD text with different structure (dimensions/weights) gets different cache key.
        prelim_resume_ids = [r.id for (r, _, _) in prelim]
        cached_map = {}
        if prelim_resume_ids:
            cache_q = select(MatchResult).where(
                MatchResult.jd_hash == jd_structure_hash,
                MatchResult.resume_id.in_(prelim_resume_ids),
            )
            cache_res = await db.execute(cache_q)
            cached_list = cache_res.scalars().all()
            # Only accept cache rows produced by current engine version
            for m in cached_list:
                fb = m.factor_breakdown or {}
                if fb.get("engine_version") == JD_MATCH_ENGINE_VERSION:
                    cached_map[m.resume_id] = m

        # -----------------------------
        # 6) Phase-2: GPT evidence + deterministic scoring
        # -----------------------------
        from src.services.scoring_v2 import score_breakdown, score_total
        from src.services.explanation_v2 import build_explanation
        from src.utils.skill_normalizer import normalize_skills

        # Prepare JD required skill normalization map to preserve human-friendly casing
        jd_norm_to_original = {}
        for s in jd_required_skills:
            key = s.lower().strip()
            if key and key not in jd_norm_to_original:
                jd_norm_to_original[key] = s

        semaphore = asyncio.Semaphore(max(1, settings.ollama_max_parallel))

        async def score_one(resume: Resume, resume_data: dict):
            detached = format_resume_response(resume)
            detached["resume_id"] = resume.id
            detached["raw_text"] = resume.raw_text or ""
            detached["summary"] = resume_data.get("summary", "")
            # CRITICAL: canonical resume skills (used for matched/missing AND GPT evidence)
            from src.utils.resume_skill_builder import build_canonical_resume_skills
            parsed = resume.parsed_data or {}
            canonical_skills = build_canonical_resume_skills(resume.skills, parsed)
            detached["skills"] = canonical_skills
            detached["experience_years"] = resume_data.get("experience_years", 0)
            detached["resume_candidate_name"] = detached.get("name")
            detached["resume_role"] = detached.get("role")
            detached["resume_experience"] = detached.get("experience_years", 0)

            # Use cached result if available (skip GPT)
            cached = cached_map.get(resume.id)
            if cached and cached.match_score is not None:
                logger.debug(
                    f"[v2] Using cached score for resume {resume.id} ({detached.get('name', 'Unknown')}): "
                    f"score={cached.match_score}, structure_hash={jd_structure_hash[:8]}..."
                )
                fb = cached.factor_breakdown or {}
                breakdown = fb.get("score_breakdown") or {}
                matched = (cached.keyword_matches or {}).get("matched_skills", []) if cached.keyword_matches else []
                missing = (cached.keyword_matches or {}).get("missing_skills", []) if cached.keyword_matches else []
                evidence_skills = fb.get("evidence_skills") or []
                explanation = cached.match_explanation or ""

                return {
                    # Mandatory fields
                    "candidate": detached.get("name") or "Unknown Candidate",
                    "total_score": int(round(cached.match_score or 0)),
                    "score_breakdown": breakdown,
                    "matched_skills": matched,
                    "missing_skills": missing,
                    "evidence_skills": evidence_skills,
                    "explanation": explanation,
                    # Extra fields for UI usefulness
                    "resume_id": resume.id,
                    "file_url": detached.get("file_url"),
                    "source_type": detached.get("source_type"),
                    "source_id": detached.get("source_id"),
                    "user_type": detached.get("user_type"),
                    "role": detached.get("role"),
                    "experience_years": detached.get("experience_years"),
                    "location": detached.get("location"),
                    "ready_to_relocate": detached.get("ready_to_relocate"),
                    "preferred_location": detached.get("preferred_location"),
                    "notice_period": detached.get("notice_period"),
                    "uploaded_at": detached.get("uploaded_at"),
                    "_cached": True,
                }

            logger.debug(
                f"[v2] Computing new score for resume {resume.id} ({detached.get('name', 'Unknown')}) "
                f"(no cache match for structure_hash={jd_structure_hash[:8]}...)"
            )

            # LLM step (Ollama) - fall back to heuristic evidence if unavailable
            try:
                async with semaphore:
                    evidence = await openai_service.extract_resume_evidence_v2(detached, jd_struct)
            except Exception as e:
                logger.warning(
                    "[v2] Ollama unavailable for resume evidence; using heuristic evidence. "
                    "%s: %s",
                    type(e).__name__,
                    e or "(no message)",
                )
                evidence = {"evidence_by_dimension": {}}

            evidence_by_dim = (evidence or {}).get("evidence_by_dimension", {}) or {}

            # If no evidence returned (or fallback), approximate confidence using skill overlap per dimension
            confidence_by_dim = {}
            if evidence_by_dim:
                confidence_by_dim = {
                    dim_id: (data or {}).get("confidence", "none") for dim_id, data in evidence_by_dim.items()
                }
            else:
                # selected_dimensions contains per-dimension required skills from JD extraction (LLM or heuristic).
                # Use overlap against canonical resume skills to estimate confidence.
                resume_skill_set = set(normalize_skills(detached.get("skills") or []))
                for d in selected_dimensions:
                    if not isinstance(d, dict):
                        continue
                    dim_id = d.get("dimension_id")
                    if not dim_id:
                        continue
                    req = d.get("required_skills") or []
                    req_norm = set(normalize_skills(req))
                    overlap = len(req_norm.intersection(resume_skill_set))
                    if overlap >= 5:
                        confidence_by_dim[dim_id] = "high"
                    elif overlap >= 2:
                        confidence_by_dim[dim_id] = "medium"
                    elif overlap >= 1:
                        confidence_by_dim[dim_id] = "low"
                    else:
                        confidence_by_dim[dim_id] = "none"
            
            logger.debug(
                f"[v2] GPT evidence for resume {resume.id}: {confidence_by_dim}"
            )

            # DISPLAY-ONLY: evidence skills extracted by GPT (must not affect scoring).
            # Deduplicate by normalized key but preserve original casing for UI.
            evidence_norm_to_original = {}
            for _, data in evidence_by_dim.items():
                if not isinstance(data, dict):
                    continue
                for s in (data.get("evidence_skills") or []):
                    if not isinstance(s, str):
                        continue
                    raw = " ".join(s.strip().split())
                    if not raw:
                        continue
                    key = raw.lower()
                    if key not in evidence_norm_to_original:
                        evidence_norm_to_original[key] = raw

            # Deterministic order, original casing preserved
            evidence_skills = [evidence_norm_to_original[k] for k in sorted(evidence_norm_to_original.keys())]

            breakdown = score_breakdown(confidence_by_dim, weights)
            total = score_total(breakdown)
            
            logger.debug(
                f"[v2] Computed score for resume {resume.id} ({detached.get('name', 'Unknown')}): "
                f"total={total}, breakdown={breakdown}"
            )

            # Real matched/missing skills (skill names only)
            # detached.skills is canonical + normalized already (lowercase), but keep normalize_skills for safety
            resume_norm_skills = set(normalize_skills(detached.get("skills") or []))
            jd_norm_skills = set([k for k in jd_norm_to_original.keys()])
            matched_norm = sorted(jd_norm_skills.intersection(resume_norm_skills))
            missing_norm = sorted(jd_norm_skills.difference(resume_norm_skills))
            matched = [jd_norm_to_original[n] for n in matched_norm]
            missing = [jd_norm_to_original[n] for n in missing_norm]

            explanation = build_explanation(
                total_score=total,
                breakdown=breakdown,
                dimension_labels=dim_labels,
                matched_skills=matched,
                missing_skills=missing,
            )

            return {
                # Mandatory fields
                "candidate": detached.get("name") or "Unknown Candidate",
                "total_score": total,
                "score_breakdown": breakdown,
                "matched_skills": matched,
                "missing_skills": missing,
                "evidence_skills": evidence_skills,
                "explanation": explanation,
                # Extra fields for UI usefulness
                "resume_id": resume.id,
                "file_url": detached.get("file_url"),
                "source_type": detached.get("source_type"),
                "source_id": detached.get("source_id"),
                "user_type": detached.get("user_type"),
                "role": detached.get("role"),
                "experience_years": detached.get("experience_years"),
                "location": detached.get("location"),
                "ready_to_relocate": detached.get("ready_to_relocate"),
                "preferred_location": detached.get("preferred_location"),
                "notice_period": detached.get("notice_period"),
                "uploaded_at": detached.get("uploaded_at"),
                "_cached": False,
            }

        tasks = [score_one(r, rd) for (r, rd, _) in prelim]
        scored = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        to_persist = []
        for item in scored:
            if isinstance(item, Exception):
                logger.warning(f"[v2] Resume scoring failed: {item}")
                continue
            if item and item.get("total_score", 0) >= min_score:
                results.append(item)
                # Persist only newly computed results
                if item.get("_cached") is False:
                    to_persist.append(item)

        # Persist new cache rows (best-effort). Requires alembic migration 002_add_jd_hash_cache applied.
        # NOTE: Using jd_structure_hash (not jd_hash) ensures cache is structure-aware.
        for r in to_persist:
            try:
                db.add(
                    MatchResult(
                        job_id=job_id,
                        jd_hash=jd_structure_hash,  # Structure-aware cache key
                        resume_id=r["resume_id"],
                        source_type=r.get("source_type"),
                        source_id=r.get("source_id"),
                        match_score=float(r.get("total_score", 0)),
                        match_explanation=r.get("explanation", "") or "",
                        keyword_matches={
                            "matched_skills": r.get("matched_skills") or [],
                            "missing_skills": r.get("missing_skills") or [],
                        },
                        factor_breakdown={
                            "v2": True,
                            "engine_version": JD_MATCH_ENGINE_VERSION,
                            "jd_role": jd_role,
                            "weights": weights,
                            "score_breakdown": r.get("score_breakdown") or {},
                            "dimension_labels": dim_labels,
                            # DISPLAY-ONLY (must never affect scoring)
                            "evidence_skills": r.get("evidence_skills") or [],
                        },
                    )
                )
            except Exception:
                # Ignore insert errors (e.g., concurrent insert hits unique constraint)
                continue
        try:
            if to_persist:
                await db.commit()
        except Exception:
            await db.rollback()

        results.sort(key=lambda x: x.get("total_score", 0), reverse=True)
        results = results[:top_n]
        # Remove internal flags
        results = [{k: v for k, v in r.items() if k != "_cached"} for r in results]

        # Deterministic recommendation
        recommendation = "No suitable candidates found for this JD."
        if results:
            best = results[0]
            if len(results) >= 2 and abs(results[0]["total_score"] - results[1]["total_score"]) <= 3:
                recommendation = "Both candidates are comparable; role focus should decide."
            else:
                recommendation = f"{best['candidate']} is the stronger match for this JD."

        return {
            "jd_role": jd_role,
            "jd_hash": jd_hash,
            "jd_filename": jd_filename,
            "total_resumes_analyzed": total_resumes,
            "results": results,
            "recommendation": recommendation,
            # Helpful metadata
            "dimensions": [{"dimension_id": d_id, "label": dim_labels.get(d_id, d_id), "weight": weights.get(d_id, 0)} for d_id in selected_dim_ids],
            "jd_requirements": {
                "min_experience_years": min_experience_years,
                "required_skills": jd_required_skills,
                "preferred_skills": jd_preferred_skills,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[v2] JD Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"JD Analysis v2 failed: {str(e)}")


@router.get("/results/{job_id}")
async def get_jd_results(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get saved JD analysis results"""
    try:
        # Get JD analysis
        jd_query = select(JDAnalysis).where(JDAnalysis.job_id == job_id)
        jd_result = await db.execute(jd_query)
        jd_analysis = jd_result.scalar_one_or_none()
        
        if not jd_analysis:
            raise HTTPException(status_code=404, detail="JD analysis not found")
        
        # Get match results
        match_query = select(MatchResult).where(
            MatchResult.job_id == job_id
        ).order_by(MatchResult.match_score.desc())
        match_result = await db.execute(match_query)
        match_results = match_result.scalars().all()
        
        # Fetch resume details for each match
        matches = []
        for match in match_results:
            resume_query = select(Resume).where(Resume.id == match.resume_id)
            resume_result = await db.execute(resume_query)
            resume = resume_result.scalar_one_or_none()
            

            if resume:
                base_response = format_resume_response(resume)
                matches.append({
                    **base_response,
                    'resume_id': resume.id,
                    'match_score': match.match_score,
                    'skill_match': match.skill_match_score,
                    'experience_match': match.experience_match_score,
                    'semantic_score': match.semantic_score,
                    # NEW: Universal Fit Score factors
                    'universal_fit_score': match.universal_fit_score or match.match_score,
                    'skill_evidence_score': match.skill_evidence_score or match.skill_match_score,
                    'execution_score': match.execution_score or match.experience_match_score,
                    'complexity_score': match.complexity_score or match.semantic_score,
                    'learning_agility_score': match.learning_agility_score or 0.0,
                    'domain_context_score': match.domain_context_score or 0.0,
                    'communication_score': match.communication_score or 0.0,
                    'notice_period': getattr(match, 'notice_period', 0), # Fallback if not in schema yet
                    'factor_breakdown': match.factor_breakdown or {},
                    # Legacy fields
                    'matched_skills': match.keyword_matches.get('matched_skills', []) if match.keyword_matches else [],
                    'missing_skills': match.keyword_matches.get('missing_skills', []) if match.keyword_matches else [],
                    'match_explanation': match.match_explanation,
                    'candidate_name': base_response.get('name')
                })
        
        return {
            'job_id': job_id,
            'jd_filename': jd_analysis.jd_filename,
            'submitted_at': jd_analysis.submitted_at.isoformat() if jd_analysis.submitted_at else None,
            'submitted_by': jd_analysis.submitted_by,
            'jd_requirements': {
                'required_skills': jd_analysis.required_skills,
                'preferred_skills': jd_analysis.preferred_skills,
                'min_experience_years': jd_analysis.required_experience,
                'education': jd_analysis.education,
                'job_level': jd_analysis.job_level
            },
            'total_matches': len(matches),
            'matches': matches
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get JD results error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_jd_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get JD analysis history"""
    try:
        total_result = await db.execute(select(func.count(JDAnalysis.id)))
        total = total_result.scalar()
        
        jd_query = select(JDAnalysis).order_by(
            JDAnalysis.submitted_at.desc()
        ).offset(skip).limit(limit)
        jd_result = await db.execute(jd_query)
        jd_analyses = jd_result.scalars().all()
        
        history = []
        for jd in jd_analyses:
            # Count matches for this JD
            match_count_result = await db.execute(
                select(func.count(MatchResult.id)).where(MatchResult.job_id == jd.job_id)
            )
            match_count = match_count_result.scalar()
            
            history.append({
                'job_id': jd.job_id,
                'jd_filename': jd.jd_filename,
                'submitted_at': jd.submitted_at.isoformat() if jd.submitted_at else None,
                'submitted_by': jd.submitted_by,
                'total_matches': match_count,
                'required_skills': jd.required_skills,
                'job_level': jd.job_level
            })
        
        return {
            'total': total,
            'skip': skip,
            'limit': limit,
            'history': history
        }
    
    except Exception as e:
        logger.error(f"Get JD history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
