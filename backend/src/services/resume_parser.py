"""Resume parsing service with OpenAI and fallback support."""
import re
from typing import Dict, List, Optional
from src.services.file_processor import extract_text_from_file
from src.services import openai_service
from src.schemas.resume import ParsedResume
from src.utils.logger import get_logger
from src.utils.text_normalize import normalize_dashes, normalize_dashes_deep

logger = get_logger(__name__)


def normalize_skills(skills: List[str]) -> List[str]:
    """Normalize skills: lowercase, strip, deduplicate."""
    if not skills:
        return []
    normalized = [s.lower().strip() for s in skills if s and s.strip()]
    return list(set(normalized))


def coerce_to_str(value, default: str = "") -> str:
    """Coerce AI/form values to a plain string."""
    if value is None:
        return default
    if isinstance(value, str):
        return normalize_dashes(value.strip())
    if isinstance(value, (int, float)):
        return str(value).strip()
    if isinstance(value, dict):
        for v in value.values():
            if isinstance(v, str) and v.strip():
                return v.strip()
        return default
    if isinstance(value, list) and value:
        return coerce_to_str(value[0], default)
    s = str(value).strip()
    return s if s else default


def normalize_contact_info(value) -> str:
    """Ensure resume_contact_info is a single email string (ParsedResume schema)."""
    if value is None:
        return "Not mentioned"
    if isinstance(value, str):
        s = value.strip()
        if not s or s.lower() == "not mentioned":
            return "Not mentioned"
        return s
    if isinstance(value, dict):
        for key in ("email", "mail", "e_mail", "contact", "resume_contact_info"):
            if key in value:
                normalized = normalize_contact_info(value[key])
                if normalized != "Not mentioned":
                    return normalized
        for v in value.values():
            if isinstance(v, str) and "@" in v:
                return v.strip()
        for v in value.values():
            if isinstance(v, str) and v.strip():
                return v.strip()
        return "Not mentioned"
    if isinstance(value, list):
        for item in value:
            normalized = normalize_contact_info(item)
            if normalized != "Not mentioned":
                return normalized
        return "Not mentioned"
    s = str(value).strip()
    return s if s else "Not mentioned"


_STRING_DEFAULT_NOT_MENTIONED = (
    "resume_candidate_name",
    "resume_role",
    "resume_location",
    "resume_degree",
    "resume_university",
)


def sanitize_parsed_data(data: Dict) -> Dict:
    """Normalize types from LLM output so ParsedResume validation and APIs stay consistent."""
    out = normalize_dashes_deep(dict(data))
    out["resume_contact_info"] = normalize_contact_info(out.get("resume_contact_info"))

    for key in _STRING_DEFAULT_NOT_MENTIONED:
        if key in out:
            val = coerce_to_str(out[key], "")
            out[key] = val if val else "Not mentioned"

    for key in (
        "resume_phone",
        "resume_address",
        "resume_city",
        "resume_country",
        "resume_zip_code",
        "current_company",
    ):
        if key in out:
            out[key] = coerce_to_str(out[key], "")

    try:
        out["resume_experience"] = float(out.get("resume_experience") or 0)
    except (TypeError, ValueError):
        out["resume_experience"] = 0.0

    return out


def merge_skills(resume_skills: List[str], form_skills: Optional[str] = None) -> List[str]:
    """Merge resume skills and form skills, deduplicate."""
    all_skills = list(resume_skills) if resume_skills else []
    
    if form_skills:
        form_skill_list = [s.strip() for s in form_skills.split(',') if s.strip()]
        all_skills.extend(form_skill_list)
    
    return normalize_skills(all_skills)


async def parse_resume(
    file_path: str, 
    file_extension: str,
    form_data: Optional[Dict] = None
) -> Dict:
    """
    Parse resume and extract structured data.
    Uses OpenAI GPT-4 as primary method with fallback to traditional parsing.
    Returns: Dict matching ParsedResume schema.
    
    Args:
        file_path: Path to resume file
        file_extension: File extension (pdf, docx)
        form_data: Optional form data to merge (name, email, phone, skills)
    """
    # Step 1: Extract raw text from file
    raw_text = extract_text_from_file(file_path, file_extension)
    
    if not raw_text:
        raise ValueError("Failed to extract text from resume")
    
    # Step 2: Try OpenAI parsing first
    try:
        parsed_data = await openai_service.parse_resume_with_gpt(raw_text)
        parsed_data['raw_text'] = raw_text
        parsed_data['parsing_method'] = 'openai'
    except Exception as e:
        logger.warning(f"OpenAI parsing failed: {e}, falling back to traditional parsing")
        # Step 3: Fallback to traditional parsing
        parsed_data = fallback_parse_resume(raw_text)
        parsed_data['raw_text'] = raw_text
        parsed_data['parsing_method'] = 'fallback'
    
    # Step 4: Merge form data (form data takes priority for explicit corrections)
    if form_data:
        # Name
        if form_data.get('fullName'):
             parsed_data['resume_candidate_name'] = form_data['fullName']
        elif form_data.get('fullName'):
             logger.info(f"Resume name '{parsed_data.get('resume_candidate_name')}', form name '{form_data.get('fullName')}'")
        
        # Email
        if form_data.get('email'):
             parsed_data['resume_contact_info'] = form_data['email']
        
        # Phone
        if form_data.get('phone'):
             parsed_data['resume_phone'] = form_data['phone']

        # Location
        if form_data.get('location'):
             parsed_data['resume_location'] = form_data['location']
             parsed_data['location'] = form_data['location']

        # Role
        if form_data.get('role'):
             parsed_data['resume_role'] = form_data['role']
             parsed_data['role'] = form_data['role']
        
        # Experience
        if form_data.get('experience'):
             try:
                 import re
                 exp_str = str(form_data['experience'])
                 exp_match = re.search(r'[\d.]+', exp_str)
                 if exp_match:
                     parsed_data['resume_experience'] = float(exp_match.group())
             except:
                 pass

        # Education (Append or set)
        if form_data.get('education'):
            parsed_data['user_provided_education'] = form_data['education']
            # If AI missed education, you might want to try to use this?
            # For now just storing it is enough for display if frontend uses it
        
        # Skills
        form_skills_str = form_data.get('skills') or form_data.get('form_skills')
        if form_skills_str:
            resume_skills = parsed_data.get('resume_technical_skills', []) or []
            # Ensure list
            if not isinstance(resume_skills, list): resume_skills = []
            
            merged_skills = merge_skills(resume_skills, form_skills_str)
            parsed_data['resume_technical_skills'] = merged_skills
            parsed_data['all_skills'] = merged_skills
    
    # Step 5: Ensure all_skills is populated (merge resume_technical_skills if not already merged)
    if not parsed_data.get('all_skills'):
        parsed_data['all_skills'] = normalize_skills(parsed_data.get('resume_technical_skills', []))
    
    # Step 6: Sanitize LLM types, then validate against ParsedResume schema
    parsed_data = sanitize_parsed_data(parsed_data)
    try:
        validated = ParsedResume(**parsed_data)
        return validated.model_dump()
    except Exception as e:
        logger.warning(f"Schema validation failed after sanitize, returning sanitized data: {e}")
        return parsed_data


def fallback_parse_resume(text: str) -> Dict:
    """
    Traditional resume parsing using regex and pattern matching.
    Used as fallback when OpenAI is unavailable.
    Returns: Dict matching ParsedResume schema.
    """
    logger.info("Using fallback resume parsing")
    
    name = extract_name(text)
    email = extract_email(text)
    phone = extract_phone(text)
    skills = extract_skills(text)
    experience = extract_experience_years(text)
    certs = extract_certificates(text)
    achieve = extract_achievements(text)
    
    result = {
        "resume_candidate_name": name if name else "Not mentioned",
        "resume_contact_info": email if email else "Not mentioned",
        "resume_phone": phone if phone else "",
        "resume_role": "Not mentioned",  # Fallback can't reliably extract this
        "resume_location": "Not mentioned",
        "resume_address": "",
        "resume_city": "",
        "resume_country": "",
        "resume_zip_code": "",
        "current_company": "",
        "resume_degree": "Not mentioned",
        "resume_university": "Not mentioned",
        "resume_experience": experience,
        "resume_technical_skills": normalize_skills(skills),
        "resume_projects": [],
        "resume_achievements": achieve,
        "resume_certificates": certs,
        "all_skills": normalize_skills(skills)
    }
    
    return result


def extract_certificates(text: str) -> List[str]:
    """Extract certifications using advanced section-based parsing."""
    import re
    
    found_certs = []
    
    # Common certification section headers
    cert_section_headers = [
        r'certifications?',
        r'professional certifications?',
        r'licenses? and certifications?',
        r'credentials?',
        r'professional credentials?',
        r'certificates?'
    ]
    
    # Split text into lines
    lines = text.split('\n')
    
    # Try to find certification section
    in_cert_section = False
    section_lines = []
    
    for i, line in enumerate(lines):
        line_lower = line.lower().strip()
        
        # Check if we're entering a certification section
        for header in cert_section_headers:
            if re.match(f'^{header}\\s*:?\\s*$', line_lower):
                in_cert_section = True
                section_lines = []
                break
        
        # Check if we're leaving the section (new major section starts)
        if in_cert_section and line_lower and not line.startswith(' ') and not line.startswith('\t'):
            # Check if this is a new section header
            common_sections = ['experience', 'education', 'skills', 'projects', 'summary', 'objective', 'work history']
            if any(section in line_lower for section in common_sections):
                break
        
        # Collect lines in certification section
        if in_cert_section and line.strip():
            section_lines.append(line.strip())
    
    # Parse certification lines
    if section_lines:
        for line in section_lines:
            # Remove common prefixes
            clean_line = re.sub(r'^[•\-\*\d\.]+\s*', '', line).strip()
            
            # Remove dates (e.g., "2020", "Jan 2020", "2020-2023")
            clean_line = re.sub(r'\b\d{4}\b', '', clean_line)
            clean_line = re.sub(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b', '', clean_line, flags=re.IGNORECASE)
            
            # Remove issuer info in parentheses or after dash
            clean_line = re.sub(r'\([^)]+\)', '', clean_line)
            clean_line = re.sub(r'\s*[---]\s*[A-Z][a-z]+.*$', '', clean_line)
            
            clean_line = clean_line.strip(' ,---')
            
            if clean_line and len(clean_line) > 3 and len(clean_line) < 100:
                found_certs.append(clean_line)
    
    # If no section found, use keyword-based extraction
    if not found_certs:
        cert_patterns = [
            r'AWS\s+Certified\s+[A-Za-z\s\-]+',
            r'Microsoft\s+Certified\s+[A-Za-z\s\-]+',
            r'Google\s+Cloud\s+[A-Za-z\s\-]+',
            r'Cisco\s+Certified\s+[A-Za-z\s\-]+',
            r'Oracle\s+Certified\s+[A-Za-z\s\-]+',
            r'Red\s+Hat\s+Certified\s+[A-Za-z\s\-]+',
            r'CompTIA\s+[A-Za-z\+\s]+',
            r'PMP\s+Certification',
            r'Scrum\s+Master\s+Certified',
            r'ITIL\s+[A-Za-z\s]+',
            r'CISSP',
            r'CISA',
            r'CISM',
            r'CEH',
            r'CCNA',
            r'CCNP'
        ]
        
        for pattern in cert_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                cert = match.group(0).strip()
                if cert and cert not in found_certs:
                    found_certs.append(cert)
    
    # Deduplicate and limit
    unique_certs = []
    for cert in found_certs:
        if cert not in unique_certs:
            unique_certs.append(cert)
    
    return unique_certs[:10]  # Return up to 10 certifications


def extract_achievements(text: str) -> List[str]:
    """Extract achievements/awards using keywords."""
    achieve_keywords = [
        'Award', 'Honor', 'Dean\'s List', 'Scholarship', 'Recognized', 
        'Achieved', 'Successfully', 'Won', 'Winner', 'Gold Medal', 
        'Employee of the Month', 'Star Performer', 'Appreciation'
    ]
    
    found = []
    lines = text.split('\n')
    for line in lines:
        for keyword in achieve_keywords:
            if keyword.lower() in line.lower():
                clean_line = line.strip()
                if clean_line and len(clean_line) < 120:
                    found.append(clean_line)
                    break
    
    return list(set(found))[:3]  # Limit to top 3


def extract_email(text: str) -> str:
    """Extract email using regex."""
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    matches = re.findall(email_pattern, text)
    return matches[0] if matches else ""


def extract_phone(text: str) -> str:
    """Extract phone number using regex."""
    phone_pattern = r'[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}'
    matches = re.findall(phone_pattern, text)
    return matches[0] if matches else ""


def extract_name(text: str) -> str:
    """Extract name (usually first line or first few words)."""
    lines = text.strip().split('\n')
    if lines:
        # Take first non-empty line
        for line in lines:
            if line.strip() and len(line.strip()) < 50:
                return line.strip()
    return ""


def extract_summary(text: str) -> str:
    """Extract professional summary."""
    summary_keywords = ['summary', 'objective', 'profile', 'about']
    lines = text.lower().split('\n')
    
    for i, line in enumerate(lines):
        if any(keyword in line for keyword in summary_keywords):
            # Get next 3-5 lines as summary
            summary_lines = lines[i+1:i+6]
            return ' '.join([l.strip() for l in summary_lines if l.strip()])
    
    return ""


def extract_skills(text: str) -> List[str]:
    """Extract skills using common tech keywords (returns lowercase)."""
    common_skills = [
        'Python', 'JavaScript', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin',
        'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'Spring', 'Express',
        'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Cassandra',
        'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git',
        'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
        'HTML', 'CSS', 'TypeScript', 'REST', 'GraphQL', 'Microservices'
    ]
    
    found_skills = []
    text_lower = text.lower()
    
    for skill in common_skills:
        if skill.lower() in text_lower:
            found_skills.append(skill.lower())  # Return lowercase
    
    return list(set(found_skills))  # Remove duplicates


def extract_experience_years(text: str) -> float:
    """Extract years of experience using pattern matching."""
    # Look for patterns like "5 years", "5+ years", "3-5 years"
    patterns = [
        r'(\d+)\+?\s*years?\s*(?:of\s*)?experience',
        r'experience\s*:?\s*(\d+)\+?\s*years?',
        r'(\d+)\+?\s*yrs'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text.lower())
        if matches:
            try:
                return float(matches[0])
            except:
                pass
    
    return 0.0

