"""Ollama service for AI-powered parsing and matching."""
import asyncio
import json
import httpx
from typing import Dict, List
from src.utils.logger import get_logger
from src.config.settings import settings

logger = get_logger(__name__)


def _normalize_ollama_base_url(url: str) -> str:
    """Strip trailing slashes and accidental /v1 suffix (code appends /api/chat itself)."""
    base = (url or "").strip().rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    return base.rstrip("/")


# Ollama configuration from settings
OLLAMA_BASE_URL = _normalize_ollama_base_url(settings.ollama_base_url)
OLLAMA_MODEL = settings.ollama_model
OLLAMA_MAX_TOKENS = settings.ollama_max_tokens
OLLAMA_READ_TIMEOUT = float(settings.ollama_read_timeout)
OLLAMA_CONNECT_TIMEOUT = float(settings.ollama_connect_timeout)
OLLAMA_MAX_RETRIES = max(0, int(settings.ollama_max_retries))
# Backward-compatible aliases used in other modules
OPENAI_MODEL = OLLAMA_MODEL

def get_openai_client():
    """Backward-compatible health check for AI backend availability."""
    return bool(OLLAMA_BASE_URL and OLLAMA_MODEL)


def _fallback_ollama_model(model: str) -> str:
    """Use a practical local fallback if configured model tag is unavailable."""
    if ":" in model:
        return f"{model.split(':', 1)[0]}:latest"
    return f"{model}:latest"


async def _ollama_chat_json(system_prompt: str, user_prompt: str, max_tokens: int, temperature: float) -> Dict:
    """Call Ollama chat API and parse JSON response content."""
    ollama_payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": temperature,
            "num_predict": max(64, min(int(max_tokens or OLLAMA_MAX_TOKENS), 4096)),
        },
    }
    openai_compatible_payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": max(64, min(int(max_tokens or OLLAMA_MAX_TOKENS), 4096)),
        "temperature": temperature,
    }
    generate_prompt = (
        "You must return valid JSON only. No markdown.\n\n"
        f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
    )
    ollama_generate_payload = {
        "model": OLLAMA_MODEL,
        "prompt": generate_prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": temperature,
            "num_predict": max(64, min(int(max_tokens or OLLAMA_MAX_TOKENS), 4096)),
        },
    }
    fallback_model = _fallback_ollama_model(OLLAMA_MODEL)
    timeout = httpx.Timeout(
        connect=OLLAMA_CONNECT_TIMEOUT,
        read=OLLAMA_READ_TIMEOUT,
        write=30.0,
        pool=10.0,
    )
    last_error = None

    for attempt in range(OLLAMA_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload)
                if response.status_code == 404 and fallback_model != OLLAMA_MODEL:
                    ollama_payload["model"] = fallback_model
                    response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload)
                if response.status_code == 404:
                    openai_compatible_payload["model"] = ollama_payload["model"]
                    response = await client.post(
                        f"{OLLAMA_BASE_URL}/v1/chat/completions",
                        json=openai_compatible_payload,
                    )
                if response.status_code == 404:
                    ollama_generate_payload["model"] = ollama_payload["model"]
                    response = await client.post(
                        f"{OLLAMA_BASE_URL}/api/generate",
                        json=ollama_generate_payload,
                    )
                response.raise_for_status()
                data = response.json()
                content = (
                    ((data.get("message") or {}).get("content") or "").strip()
                    or (
                        ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
                    ).strip()
                    or (data.get("response") or "").strip()
                )
                if not content:
                    raise ValueError("Empty response from Ollama")
                return json.loads(content)
        except json.JSONDecodeError as json_error:
            raise ValueError(f"Invalid JSON response from Ollama: {json_error}") from json_error
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
            last_error = e
            if attempt < OLLAMA_MAX_RETRIES:
                wait_s = 2 ** attempt
                logger.warning(
                    "Ollama request failed (%s), retry %s/%s in %ss",
                    type(e).__name__,
                    attempt + 1,
                    OLLAMA_MAX_RETRIES,
                    wait_s,
                )
                await asyncio.sleep(wait_s)
                continue
            raise
        except httpx.HTTPStatusError as e:
            last_error = e
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Ollama request failed with no response")


async def parse_resume_with_gpt(resume_text: str) -> Dict:
    """
    Use GPT-4 to extract structured data from resume text.
    Returns: Structured resume data as dictionary matching ParsedResume schema.
    """
    if not get_openai_client():
        logger.error("Ollama configuration missing")
        raise ValueError("Ollama is not configured")
    
    try:
        system_prompt = """You are an expert resume parser and HR analyst. 
Extract structured information from resumes with high accuracy.
NEVER hallucinate or invent data. If information is not present, use "Not mentioned" for strings, 0.0 for numbers, or empty arrays.
Return data as valid JSON only, no additional text."""
        
        logger.info(f"Parsing resume. Text length: {len(resume_text)}")
        user_prompt = f"""Extract Resume Data (JSON only):
{resume_text[:4000]}

Fields:
"resume_candidate_name", 
"resume_contact_info" (email), 
"resume_phone" (phone number in any format - extract from contact section, header, or anywhere in resume),
"resume_role" (current or most recent job title/role),
"resume_location" (full location string like "City, Country" or "City, State, Country"),
"resume_address" (street address if available, otherwise empty string),
"resume_city" (city name extracted from location),
"resume_country" (country name extracted from location),
"resume_zip_code" (postal/zip code if available, otherwise empty string),
"resume_degree", 
"resume_university", 
"resume_experience" (float), 
"resume_technical_skills" (list), 
"resume_projects" (list), 
"resume_achievements" (list), 
"resume_certificates" (list), 
"all_skills" (list), 
"notice_period" (days), 
"ready_to_relocate" (bool),
"current_company" (extract from work_history where is_current = 1, or most recent company if no current job marked),
"work_history": [
  {{
    "company": "...",
    "role": "...",
    "location": "...",
    "start_date": "...",
    "end_date": "..." or "Present" or "Current",
    "is_current": 0 | 1,
    "description": "Brief summary of responsibilities and achievements in this role"
  }}
]

IMPORTANT EXTRACTION RULES:
- Extract phone number from anywhere in resume (header, contact section, etc.) - formats like +1-234-567-8900, (123) 456-7890, 123-456-7890, etc.
- For address: Extract street address, city, country, and zip code separately if available
- For current_company: Use the company name from the most recent work_history entry where is_current = 1, or the most recent company if no current job is explicitly marked
- Parse location string into separate city and country fields when possible
- If location is "City, Country", extract city and country separately
- If zip code is in location string (e.g., "New York, NY 10001"), extract it to resume_zip_code
"""
        
        result = await _ollama_chat_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=min(OLLAMA_MAX_TOKENS, 4096),
            temperature=0.1,
        )
        
        # Normalize skills to lowercase and deduplicate
        if "resume_technical_skills" in result:
            result["resume_technical_skills"] = list(set([s.lower().strip() for s in result["resume_technical_skills"] if s]))
        if "all_skills" in result:
            result["all_skills"] = list(set([s.lower().strip() for s in result["all_skills"] if s]))
        
        # Extract current company from work_history if available
        work_history = result.get("work_history", [])
        if work_history and not result.get("current_company"):
            # Find current job or most recent job
            for job in work_history:
                if job.get("is_current") == 1:
                    result["current_company"] = job.get("company", "")
                    break
            # If no current job found, use most recent
            if not result.get("current_company") and work_history:
                result["current_company"] = work_history[0].get("company", "")
        
        # Parse location into city and country if not already extracted
        location = result.get("resume_location", "")
        if location and location != "Not mentioned":
            if not result.get("resume_city") and not result.get("resume_country"):
                # Try to split location string
                parts = [p.strip() for p in location.split(',')]
                if len(parts) >= 2:
                    result["resume_city"] = parts[0]
                    result["resume_country"] = parts[-1]
                elif len(parts) == 1:
                    result["resume_city"] = parts[0]
        
        # Ensure all required fields have defaults
        result.setdefault("resume_candidate_name", "Not mentioned")
        result.setdefault("resume_contact_info", "Not mentioned")
        result.setdefault("resume_phone", "")
        result.setdefault("resume_role", "Not mentioned")
        result.setdefault("resume_location", "Not mentioned")
        result.setdefault("resume_address", "")
        result.setdefault("resume_city", "")
        result.setdefault("resume_country", "")
        result.setdefault("resume_zip_code", "")
        result.setdefault("current_company", "")
        result.setdefault("resume_degree", "Not mentioned")
        result.setdefault("resume_university", "Not mentioned")
        result.setdefault("resume_experience", 0.0)
        result.setdefault("resume_technical_skills", [])
        result.setdefault("resume_projects", [])
        result.setdefault("resume_achievements", [])
        result.setdefault("resume_certificates", [])
        result.setdefault("all_skills", [])
        
        logger.info("Successfully parsed resume with Ollama")
        return result
    
    except Exception as e:
        logger.error(f"Ollama resume parsing failed: {e}")
        raise


async def extract_jd_requirements(jd_text: str) -> Dict:
    """
    Use GPT-4 to analyze job description and extract requirements.
    Returns: Structured JD requirements.
    """
    if not get_openai_client():
        logger.error("Ollama configuration missing")
        raise ValueError("Ollama is not configured")
    
    try:
        system_prompt = """You are an enterprise-grade Job Description (JD) Decomposition Engine.

Your ONLY task is to analyze a Job Description (JD) and convert it into a
structured, weighted requirement model suitable for strict resume matching.

You MUST NOT:
- Score resumes
- Mention candidates
- Infer skills not stated or strongly implied
- Add explanations outside the JSON output

You MUST:
- Decompose the JD into EXACTLY the categories listed below
- Assign weights based on importance implied by the JD
- Ensure total weight = 100
- Return VALID JSON ONLY (no markdown, no commentary)

MANDATORY JD CATEGORIES:
1. Experience & Seniority
2. Core Technical Skills
3. Networking & Protocols
4. Security Technologies
5. Cloud & Architecture
6. Incident & Operations
7. Compliance & Governance
8. Certifications

RULES:
- Prefer explicit requirements over nice-to-haves
- If a category is weakly mentioned, assign a lower weight (minimum 5)
- Do NOT invent certifications or tools
- Seniority must be inferred from role title and responsibilities
- Use concise, normalized skill names (e.g., "NGFW", "IDS/IPS", "BGP")

return JSON in the following structure ONLY:

{
  "experience_seniority": {
    "required_years": <number>,
    "role_level": "<Engineer | Senior | Lead | Manager | Architect>",
    "weight": <number>
  },
  "core_technical_skills": {
    "items": [ "<skill>", "<skill>" ],
    "weight": <number>
  },
  "networking_protocols": {
    "items": [ "<protocol>", "<protocol>" ],
    "weight": <number>
  },
  "security_technologies": {
    "items": [ "<tool_or_tech>", "<tool_or_tech>" ],
    "weight": <number>
  },
  "cloud_architecture": {
    "items": [ "<cloud_or_architecture>" ],
    "weight": <number>
  },
  "incident_operations": {
    "items": [ "<incident_or_ops_requirement>" ],
    "weight": <number>
  },
  "compliance_governance": {
    "items": [ "<standard_or_framework>" ],
    "weight": <number>
  },
  "certifications": {
    "items": [ "<certification>" ],
    "weight": <number>
  }
}
"""
        
        user_prompt = f"""Analyze this job description:

{jd_text[:3500]}

Decompose into the strict JSON format required.
"""
        
        # Use a safe maximum for tokens
        max_tokens = min(OLLAMA_MAX_TOKENS, 4096)
        result = await _ollama_chat_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        
        # Backward compatibility mapping for `jd_analysis.py` which expects flat structure
        # We perform this mapping here so the rest of the app continues to work while we transition
        # Handle both new structured format and legacy flat format
        try:
            # Check if result is in new structured format
            if "experience_seniority" in result or "core_technical_skills" in result:
                flattened_result = {
                    "job_level": (result.get("experience_seniority") or {}).get("role_level", "Experienced"),
                    "min_experience_years": (result.get("experience_seniority") or {}).get("required_years") or 0,
                    "required_skills": (
                        (result.get("core_technical_skills", {}) or {}).get("items", []) + 
                        (result.get("networking_protocols", {}) or {}).get("items", []) +
                        (result.get("security_technologies", {}) or {}).get("items", []) +
                        (result.get("cloud_architecture", {}) or {}).get("items", [])
                    ),
                    "preferred_skills": result.get("preferred_skills", []),
                    "keywords": (
                        (result.get("compliance_governance", {}) or {}).get("items", []) +
                        (result.get("incident_operations", {}) or {}).get("items", [])
                    ),
                    # Store the full structured decomposition for the matcher
                    "structured_requirements": result,
                    "weights": {k: (v.get("weight", 0) if isinstance(v, dict) else 0) for k, v in result.items() if isinstance(v, dict)},
                    "education": result.get("education", ""),
                    "key_responsibilities": result.get("key_responsibilities", [])
                }
            else:
                # Legacy flat format - use as-is with defaults
                flattened_result = {
                    "job_level": result.get("job_level", "Experienced"),
                    "min_experience_years": result.get("min_experience_years", 0),
                    "required_skills": result.get("required_skills", []),
                    "preferred_skills": result.get("preferred_skills", []),
                    "keywords": result.get("keywords", []),
                    "education": result.get("education", ""),
                    "structured_requirements": result,
                    "weights": {},
                    "key_responsibilities": result.get("key_responsibilities", [])
                }
            
            logger.info(f"Successfully extracted JD requirements with Ollama. Skills: {len(flattened_result.get('required_skills', []))}")
            return flattened_result
        except Exception as mapping_error:
            logger.error(f"Error mapping JD requirements structure: {mapping_error}. Raw result: {result}")
            # Fallback to basic structure
            return {
                "job_level": "Experienced",
                "min_experience_years": 0,
                "required_skills": result.get("required_skills", []),
                "preferred_skills": result.get("preferred_skills", []),
                "keywords": result.get("keywords", []),
                "education": result.get("education", ""),
                "structured_requirements": result,
                "weights": {},
                "key_responsibilities": result.get("key_responsibilities", [])
            }
    
    except Exception as e:
        logger.error(f"Ollama JD extraction failed: {e}", exc_info=True)
        raise


async def extract_jd_structure_v2(jd_text: str, dimension_library: List[Dict]) -> Dict:
    """
    V2: Extract JD structure by selecting ONLY from a backend-controlled dimension library.

    GPT responsibilities:
    - Select relevant dimension IDs from the provided library
    - Extract role, min experience, and skills per selected dimension
    - (Optional) include evidence_snippets, but scoring must NOT depend on them

    GPT must NEVER:
    - Invent new dimension IDs
    - Assign weights or numeric scores
    """
    from src.schemas.jd_v2 import JDStructureV2, JDSelectedDimensionV2

    if not get_openai_client():
        logger.error("Ollama configuration missing")
        raise ValueError("Ollama is not configured")

    allowed_ids = {d.get("id") for d in (dimension_library or []) if isinstance(d, dict)}
    if not allowed_ids:
        raise ValueError("Dimension library is empty or invalid")

    # Keep the library compact in the prompt (ids + definitions + seed_skills).
    lib_payload = [
        {
            "id": d.get("id"),
            "label": d.get("label"),
            "definition": d.get("definition"),
            "seed_skills": d.get("seed_skills", []),
        }
        for d in (dimension_library or [])
        if isinstance(d, dict)
    ]

    system_prompt = """You are a Job Description (JD) extraction engine.

Your job:
- Read the JD text and output ONLY valid JSON (no markdown, no commentary).
- Select relevant dimension IDs ONLY from the provided DIMENSION_LIBRARY.
- Extract skills/requirements per selected dimension.

Hard rules (STRICT - for deterministic output):
- You MUST NOT invent new dimension IDs.
- You MUST NOT output weights or numeric scoring.
- Skills must be concise, normalized strings (e.g., \"Palo Alto\", \"BGP\", \"NGFW\", \"AWS\").
- Prefer explicit requirements; do not hallucinate.
- Do NOT vary dimension selection between runs for the same input.
- Output MUST be stable and deterministic.
- If a requirement fits multiple dimensions, choose the BEST single match based on explicit JD text.
- If the JD text does not clearly support a dimension, DO NOT include it.

Output JSON schema (exact keys):
{
  "jd_role": "<string>",
  "min_experience_years": <number>,
  "selected_dimensions": [
    {
      "dimension_id": "<one_of_library_ids>",
      "priority": "MUST" | "SHOULD" | "NICE",
      "required_skills": ["<skill>", "..."],
      "preferred_skills": ["<skill>", "..."],
      "evidence_snippets": ["<optional short quotes from JD>", "..."] // OPTIONAL
    }
  ]
}
"""

    user_prompt = f"""DIMENSION_LIBRARY (use ONLY these ids):
{json.dumps(lib_payload, indent=2)[:12000]}

JOB_DESCRIPTION:
{jd_text[:6000]}

Select 3-8 relevant dimensions from the library (use 'other_relevant' only if necessary).
Extract required_skills and preferred_skills per selected dimension.
IMPORTANT: Be consistent - the same JD text must always produce the same dimension selection.
Return JSON only."""

    result = await _ollama_chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=min(OLLAMA_MAX_TOKENS, 2048),
        temperature=0.0,
    )

    # Validate schema
    parsed = JDStructureV2.model_validate(result)

    # ------------------------------------------------------------------
    # Dimension dilution guardrails (Option A):
    # - Always include experience_seniority and core_technical_skills
    # - Limit selected dimensions to a maximum of 5 (deterministic)
    # ------------------------------------------------------------------
    must_include = ["experience_seniority", "core_technical_skills"]
    existing_ids = [d.dimension_id for d in parsed.selected_dimensions]
    for dim_id in must_include:
        if dim_id not in existing_ids and dim_id in allowed_ids:
            parsed.selected_dimensions.insert(
                0,
                JDSelectedDimensionV2(
                    dimension_id=dim_id,
                    priority="MUST",
                    required_skills=[],
                    preferred_skills=[],
                    evidence_snippets=None,
                ),
            )

    # Deduplicate while preserving order (keep first occurrence)
    seen = set()
    deduped = []
    for d in parsed.selected_dimensions:
        if d.dimension_id in seen:
            continue
        seen.add(d.dimension_id)
        deduped.append(d)

    # Ensure must_include appear first, then keep remaining original order
    prioritized = []
    for dim_id in must_include:
        for d in deduped:
            if d.dimension_id == dim_id:
                prioritized.append(d)
                break
    for d in deduped:
        if d.dimension_id not in must_include:
            prioritized.append(d)

    parsed.selected_dimensions = prioritized[:5]

    # Enforce library-only dimension ids
    used_ids = {d.dimension_id for d in parsed.selected_dimensions}
    unknown = sorted([i for i in used_ids if i not in allowed_ids])
    if unknown:
        raise ValueError(f"JD v2 extraction returned unknown dimension ids: {unknown}")

    # Return normalized dict
    return parsed.model_dump()


async def extract_resume_evidence_v2(resume_data: Dict, jd_structure_v2: Dict) -> Dict:
    """
    V2: For a given resume and an already-extracted JD structure, return evidence + confidence per dimension.

    Confidence is strictly one of: high | medium | low | none

    GPT responsibilities:
    - Provide confidence label per dimension
    - Provide evidence_skills (skill strings) and optionally a short evidence_text

    GPT must NEVER:
    - Assign weights or numeric scores
    - Rank candidates
    """
    from src.schemas.jd_v2 import ResumeEvidenceV2

    if not get_openai_client():
        logger.error("Ollama configuration missing")
        raise ValueError("Ollama is not configured")

    # Compact JD structure for prompt
    selected = (jd_structure_v2 or {}).get("selected_dimensions", []) or []
    jd_role = (jd_structure_v2 or {}).get("jd_role", "Not mentioned")
    jd_min_exp = (jd_structure_v2 or {}).get("min_experience_years", 0)

    jd_dim_payload = [
        {
            "dimension_id": d.get("dimension_id"),
            "priority": d.get("priority"),
            "required_skills": d.get("required_skills", []),
            "preferred_skills": d.get("preferred_skills", []),
        }
        for d in selected
        if isinstance(d, dict) and d.get("dimension_id")
    ]

    # Skills: keep it safe and string-only (this should be the canonical resume skill set)
    skills = resume_data.get("skills", []) or []
    skill_strs = []
    for s in skills[:40]:
        if s is None:
            continue
        if isinstance(s, str) and s.strip():
            skill_strs.append(s.strip())
        else:
            try:
                ss = str(s).strip()
                if ss:
                    skill_strs.append(ss)
            except Exception:
                continue

    # Work history: bounded concatenation to enrich evidence extraction deterministically
    work_items = resume_data.get("work_history") or []
    wh_lines = []
    if isinstance(work_items, list):
        for w in work_items[:8]:
            if not isinstance(w, dict):
                continue
            role = (w.get("role") or "").strip()
            company = (w.get("company") or "").strip()
            desc = (w.get("description") or "").strip()
            head = " - ".join([x for x in [role, company] if x])
            line = f"{head}: {desc}" if head and desc else (head or desc)
            if line:
                wh_lines.append(line)
    work_history_block = "\n".join(wh_lines)[:1000]

    # Bounded raw text — smaller window keeps remote Ollama calls under timeout
    raw_text_block = (resume_data.get("raw_text") or "")[:4000]

    system_prompt = """You are a Resume Evidence Extractor for ATS matching.

Return JSON only.

For EACH JD dimension provided, output:
- confidence: high | medium | low | none
- evidence_skills: list of skill strings found in resume that support the dimension
- evidence_text: OPTIONAL short phrase (no more than 200 chars)

Rules:
- Do NOT output numeric scores or percentages.
- Do NOT invent skills. Only extract what is present or strongly supported by the resume text.
- If there is no evidence, confidence must be 'none' and evidence_skills should be [].

Output JSON schema:
{
  "evidence_by_dimension": {
    "<dimension_id>": {
      "confidence": "high|medium|low|none",
      "evidence_skills": ["..."],
      "evidence_text": "..." // optional
    }
  }
}
"""

    user_prompt = f"""JD ROLE: {jd_role}
JD MIN EXPERIENCE: {jd_min_exp}

JD DIMENSIONS:
{json.dumps(jd_dim_payload, indent=2)[:8000]}

RESUME:
Name: {resume_data.get('resume_candidate_name') or resume_data.get('name') or 'Unknown'}
Role: {resume_data.get('resume_role') or resume_data.get('role') or 'Not mentioned'}
Experience Years: {resume_data.get('resume_experience') or resume_data.get('experience_years') or 0}
Canonical Skills: {', '.join(skill_strs) if skill_strs else 'None'}

Work History (most relevant):
{work_history_block if work_history_block else 'None'}

Resume Summary:
{(resume_data.get('summary') or '')[:2500]}

Resume Raw Text:
{raw_text_block}

Return JSON only."""

    result = await _ollama_chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=min(OLLAMA_MAX_TOKENS, 2048),
        temperature=0.0,
    )

    parsed = ResumeEvidenceV2.model_validate(result)
    return parsed.model_dump()


async def calculate_intelligent_match(resume_data: Dict, jd_requirements: Dict) -> Dict:
    """
    Use GPT-4 to perform intelligent semantic matching.
    Returns: Match score and detailed analysis.
    """
    if not get_openai_client():
        logger.error("Ollama configuration missing")
        raise ValueError("Ollama is not configured")
    
    try:
        system_prompt = """You are an enterprise-grade Resume Analysis Engine.

Your task is to provide QUALITATIVE JUDGMENTS ONLY for each JD category.

DO NOT:
- Return numeric scores
- Return percentages
- Calculate final scores
- Apply penalties or bonuses

DO:
- Assess match level (HIGH, MEDIUM, LOW, NO)
- Assess ownership level (LED, OWNED, CONTRIBUTED, ASSISTED, NONE)
- Provide evidence from resume
- Indicate if experience is recent (last 5 years)

MATCH LEVEL DEFINITIONS:
- HIGH: Candidate has deep, proven expertise with strong evidence
- MEDIUM: Candidate has relevant experience but limited depth
- LOW: Candidate has minimal or tangential experience
- NO: No evidence of this skill/experience

OWNERSHIP LEVEL DEFINITIONS:
- LED: Led teams, projects, or initiatives (leadership verbs: led, managed, directed, architected)
- OWNED: Owned outcomes, systems, or processes (ownership verbs: owned, designed, built, implemented)
- CONTRIBUTED: Contributed to team efforts (contribution verbs: contributed, developed, worked on)
- ASSISTED: Assisted or supported (support verbs: assisted, supported, helped)
- NONE: No evidence

STRICT RULES:
- Prioritize recent experience (last 5 years)
- Look for ownership verbs over participation verbs
- Require explicit evidence, not assumptions
- Be brutally honest

OUTPUT FORMAT (JSON ONLY):
{
  "experience_seniority": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Specific evidence from resume",
    "recent": true|false
  },
  "core_technical_skills": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Specific skills mentioned"
  },
  "networking_protocols": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Specific protocols/technologies"
  },
  "security_technologies": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Specific security tools/technologies"
  },
  "cloud_architecture": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Specific cloud platforms/architectures"
  },
  "incident_operations": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Incident handling experience"
  },
  "compliance_governance": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "LED|OWNED|CONTRIBUTED|ASSISTED|NONE",
    "evidence": "Compliance standards/frameworks"
  },
  "certifications": {
    "match_level": "HIGH|MEDIUM|LOW|NO",
    "ownership": "OWNED|NONE",
    "evidence": "Certifications held"
  }
}
"""
        
        # Prepare structured inputs for the prompt
        structured_jd = jd_requirements.get('structured_requirements', jd_requirements)
        
        # Handle certifications - can be strings, dictionaries, lists, or nested structures
        certifications = resume_data.get('certifications', [])
        cert_strs = []
        
        # First, flatten any nested lists
        flat_certs = []
        for item in certifications:
            if item is None:
                continue
            if isinstance(item, list):
                flat_certs.extend([c for c in item if c is not None])
            else:
                flat_certs.append(item)
        
        # Now process each cert
        for cert in flat_certs:
            if cert is None:
                continue
            try:
                if isinstance(cert, dict):
                    # Extract name or use string representation
                    # Handle nested dicts - ensure we always get a string
                    name = cert.get('name') or cert.get('certification') or cert.get('cert_name')
                    if name:
                        # If name is still a dict or list, convert to string
                        if isinstance(name, dict):
                            cert_str = json.dumps(name)
                        elif isinstance(name, list):
                            cert_str = ', '.join(str(c) for c in name if c is not None)
                        else:
                            cert_str = str(name) if not isinstance(name, str) else name
                    else:
                        # Fallback to JSON string representation of entire dict
                        cert_str = json.dumps(cert)
                elif isinstance(cert, str):
                    cert_str = cert
                elif isinstance(cert, list):
                    # If cert is a list, join its string representations
                    cert_str = ', '.join(str(c) for c in cert if c is not None)
                else:
                    # Convert anything else to string
                    cert_str = str(cert)
                
                # Final safety check - ensure it's a string and not empty before appending
                if isinstance(cert_str, str) and cert_str.strip():
                    cert_strs.append(cert_str.strip())
            except Exception as cert_error:
                # If anything goes wrong, just skip this cert
                logger.warning(f"Error processing certification {cert}: {cert_error}")
                continue
        
        # Final safety check - ensure all items are strings before joining
        cert_strs = [str(c).strip() for c in cert_strs if c and str(c).strip()]
        
        # Handle skills - ensure all are strings
        skills = resume_data.get('skills', [])[:20]
        skill_strs = []
        for skill in skills:
            if skill is None:
                continue
            try:
                if isinstance(skill, (dict, list)):
                    skill_str = json.dumps(skill) if isinstance(skill, dict) else ', '.join(str(s) for s in skill if s is not None)
                else:
                    skill_str = str(skill) if not isinstance(skill, str) else skill
                if skill_str.strip():
                    skill_strs.append(skill_str.strip())
            except Exception:
                # Skip problematic skills
                continue
        
        user_prompt = f"""ANALYZE THIS RESUME AGAINST JD REQUIREMENTS:

[JD REQUIREMENTS BY CATEGORY]
{json.dumps(structured_jd, indent=2)}

[CANDIDATE RESUME]
Name: {resume_data.get('resume_candidate_name', 'Unknown')}
Current Role: {resume_data.get('role', 'N/A')}
Total Experience: {resume_data.get('experience_years', 0)} years
Skills: {', '.join(skill_strs) if skill_strs else 'None'}
Certifications: {', '.join(cert_strs) if cert_strs else 'None'}

Resume Summary:
{resume_data.get('summary', '')[:2000]}

Resume Text (Recent Experience):
{resume_data.get('raw_text', '')[:3500]}

For EACH JD category above, provide:
1. Match level (HIGH/MEDIUM/LOW/NO)
2. Ownership level (LED/OWNED/CONTRIBUTED/ASSISTED/NONE)
3. Specific evidence from resume
4. Whether experience is recent (last 5 years)

Return ONLY the JSON structure specified in the system prompt.
"""
        
        result = await _ollama_chat_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=min(OLLAMA_MAX_TOKENS, 4096),
            temperature=0.1,
        )
        logger.info("Successfully calculated intelligent match with Ollama")
        return result
    
    except Exception as e:
        logger.error(f"Ollama matching failed: {e}")
        raise
