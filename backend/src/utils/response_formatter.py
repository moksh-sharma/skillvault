"""Response formatting utilities for consistent API responses."""
from typing import Dict, Any
from src.models.resume import Resume


def map_source_type_to_user_type(source_type: str) -> str:
    """Map source_type to frontend user_type."""
    mapping = {
        'company_employee': 'Company Employee',
        'freelancer': 'Freelancer',
        'guest': 'Guest',
        'hired_force': 'Hired Force',
        'admin': 'Admin Uploads',
        'gmail': 'Gmail Resume'
    }
    return mapping.get(source_type, 'Admin Uploads')


def format_resume_response(resume: Resume) -> Dict[str, Any]:
    """Format resume for frontend consumption."""
    parsed = resume.parsed_data or {}
    meta = resume.meta_data or {}
    
    # Normalize user_type for frontend
    # First check if meta_data has user_type, otherwise derive from source_type
    user_type = meta.get('user_type')
    if not user_type:
        user_type = map_source_type_to_user_type(resume.source_type)
    
    # Ensure meta_data always has user_type
    formatted_meta = {
        **meta,
        'user_type': user_type
    }
    
    # Extract candidate details with fallbacks
    # Priority: Source Metadata (Form Data) > Parsed Data > Defaults
    
    # Name
    candidate_name = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        candidate_name = resume.source_metadata['form_data'].get('fullName')
    
    if not candidate_name:
         candidate_name = parsed.get('resume_candidate_name')
         if candidate_name == "Not mentioned":
             candidate_name = None
    
    # Email
    email = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        email = resume.source_metadata['form_data'].get('email')
        
    if not email:
        from src.services.resume_parser import normalize_contact_info
        raw_contact = parsed.get('resume_contact_info')
        email = normalize_contact_info(raw_contact)
        if email == "Not mentioned":
            email = None
    
    # Phone
    phone = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        phone = resume.source_metadata['form_data'].get('phone')
        
    if not phone:
        phone = parsed.get('resume_phone') # Assuming parser extracts this
            
    # Location
    location = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        location = resume.source_metadata['form_data'].get('location')
        
    if not location:
        location = parsed.get('resume_location')
        if not location or location == "Not mentioned":
            location = parsed.get('location')

    # Role
    role = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        role = resume.source_metadata['form_data'].get('role')
        
    if not role:
        role = parsed.get('resume_role')
        if not role or role == "Not mentioned":
             role = parsed.get('role')

    # Relocation & Notice Period
    ready_to_relocate = False
    preferred_location = None
    notice_period = 0

    if resume.source_metadata and 'form_data' in resume.source_metadata:
        form = resume.source_metadata['form_data']
        ready_to_relocate = form.get('readyToRelocate', False)
        preferred_location = form.get('preferredLocation')
        notice_period = form.get('noticePeriod', 0)
    
    # Fallback to meta_data for older records or profile updates
    if not ready_to_relocate:
        ready_to_relocate = meta.get('ready_to_relocate') or (meta.get('user_profile') or {}).get('ready_to_relocate', False)
    if not preferred_location:
        preferred_location = meta.get('preferred_location')
    if not notice_period:
        notice_period = meta.get('notice_period') or (meta.get('user_profile') or {}).get('notice_period', 0)

    # LinkedIn & Portfolio (from form_data)
    linked_in = None
    portfolio_url = None
    if resume.source_metadata and 'form_data' in resume.source_metadata:
        linked_in = resume.source_metadata['form_data'].get('linkedIn')
        portfolio_url = resume.source_metadata['form_data'].get('portfolio')
    
    # Construct file URL - always use relative API endpoint path
    # Frontend will construct full URL using its API_BASE_URL
    # This ensures it works across different environments (localhost, network IP, production)
    if resume.file_content:
        # File is stored in database, use API endpoint
        file_url = f"/api/resumes/{resume.id}/file"
    else:
        # Fallback to old file_url (for backward compatibility with old records)
        file_url = resume.file_url
        if file_url and file_url.startswith('/'):
            # Already a relative path, keep it as is
            pass
        elif file_url and (file_url.startswith('http://') or file_url.startswith('https://')):
            # Full URL - extract just the path for frontend to reconstruct
            from urllib.parse import urlparse
            parsed_url = urlparse(file_url)
            file_url = parsed_url.path
        else:
            # If no file_url, use API endpoint
            file_url = f"/api/resumes/{resume.id}/file"

    return {
        'id': resume.id,
        'filename': resume.filename,
        'file_url': file_url,
        'source_type': resume.source_type,
        'user_type': user_type, # Top level for convenience
        'name': candidate_name or "Unknown Candidate",
        'email': email,
        'phone': phone,
        'location': location,
        'role': role,
        'ready_to_relocate': ready_to_relocate,
        'preferred_location': preferred_location,
        'notice_period': notice_period,
        'linked_in': linked_in,
        'portfolio': portfolio_url,
        'source_id': resume.source_id,
        'parsed_data': parsed,
        'meta_data': formatted_meta,
        'skills': resume.skills or [],
        'experience_years': resume.experience_years or 0.0,
        'uploaded_at': resume.uploaded_at.isoformat() if resume.uploaded_at else None,
        'uploaded_by': resume.uploaded_by,
        'work_history': [
            {
                'id': exp.id,
                'company': exp.company,
                'role': exp.role,
                'location': exp.location,
                'start_date': exp.start_date,
                'end_date': exp.end_date,
                'is_current': bool(exp.is_current),
                'description': exp.description
            } for exp in (getattr(resume, 'work_history', None) or [])
        ],
        'certificates': [
            {
                'id': cert.id,
                'name': cert.name,
                'issuer': cert.issuer,
                'date_obtained': cert.date_obtained,
                'expiry_date': cert.expiry_date
            } for cert in (getattr(resume, 'certificates', None) or [])
        ],
        'educations': [
            {
                'id': edu.id,
                'degree': edu.degree,
                'institution': edu.institution,
                'field_of_study': edu.field_of_study,
                'start_date': edu.start_date,
                'end_date': edu.end_date,
                'is_completed': bool(edu.is_completed) if edu.is_completed is not None else True,
                'grade': edu.grade,
                'description': edu.description
            } for edu in (getattr(resume, 'educations', None) or [])
        ]
    }


def format_resume_list_response(resumes: list, total: int, skip: int = 0, limit: int = 100) -> Dict[str, Any]:
    """Format list of resumes with pagination metadata."""
    return {
        'resumes': [format_resume_response(resume) for resume in resumes],
        'total': total,
        'skip': skip,
        'limit': limit,
        'count': len(resumes)
    }

