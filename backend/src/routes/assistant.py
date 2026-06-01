"""Help assistant: intent-based bot, no OpenAI, no knowledge base. Uses live DB/APIs."""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from src.config.database import get_postgres_db
from src.middleware.auth_middleware import get_current_user
from src.models.resume import Resume
from src.models.user_db import User
from src.models.employee_list import CompanyEmployeeList
from src.services.employee_list_config import get_employee_list_config
from src.utils.response_formatter import format_resume_response
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/assistant", tags=["Assistant"])


def escape_like_pattern(pattern: str) -> str:
    return pattern.replace("%", "\\%").replace("_", "\\_")


# --- Intent detection (keyword / phrase matching) ---
def _normalize(msg: str) -> str:
    return (msg or "").strip().lower()


# Words to drop when extracting skills from phrases (e.g. "people who have skill of aws" -> aws)
_SKILL_STOPWORDS = {
    "a", "an", "the", "of", "with", "who", "have", "has", "people", "person", "persons",
    "skill", "skills", "list", "find", "search", "get", "show", "and", "or", "in", "for",
}


def _parse_skills_from_capture(raw: str) -> list[str]:
    """Split captured phrase into tokens and drop stopwords; return list of skill-like tokens."""
    tokens = [s.strip() for s in re.split(r"[\s,]+|(?:\s+and\s+)", raw) if s.strip()]
    skills = [t for t in tokens if t.lower() not in _SKILL_STOPWORDS and len(t) >= 2]
    return skills[:10]


def _detect_intent(message: str) -> tuple[str, dict]:
    """Returns (intent, extras). extras may contain skills, years, name/email for lookup."""
    m = _normalize(message)
    extras = {}

    # search_skills: prefer "skill(s) of X" so "list of people who have skill of aws" -> aws
    skill_patterns = [
        r"skill(?:s)?\s+of\s+([a-z0-9\s,]+?)(?:\s*$|\s+(?:in|and|or)\s+)",
        r"skill(?:s)?\s*:\s*([a-z0-9\s,]+?)(?:\s*$|\s+(?:in|and|or)\s+)",
        r"(?:with\s+)?skill(?:s)?\s+([a-z0-9\s,]+?)(?:\s+in\s+the\s+database|\s*$)",
        r"(?:who\s+has|who\s+have)\s+([a-z0-9\s,]+)",
        r"(?:person|people)\s+with\s+(?:skill(?:s)?\s+)?([a-z0-9\s,]+)",
        r"(?:find|search|get|list|show)\s+(?:person|people|candidates?|resumes?)\s+with\s+(?:skill(?:s)?\s+)?([a-z0-9\s,]+?)(?:\s+in\s+the\s+database|\s*$)",
        r"(?:find|search|get|list|show)\s+(?:person|people|candidates?|resumes?)?\s*(?:with\s+)?(?:skill(?:s)?\s+)([a-z0-9\s,]+?)(?:\s+in\s+the\s+database|\s*$)",
    ]
    for pat in skill_patterns:
        match = re.search(pat, m, re.I)
        if match:
            raw = match.group(1).strip()
            if raw and len(raw) >= 2:
                skills = _parse_skills_from_capture(raw)
                if skills:
                    extras["skills"] = skills[:10]
                    return "search_skills", extras

    # search_experience: experience more than X years, candidates with X years
    exp_match = re.search(r"(?:experience|exp)\s*(?:more\s+than|>\s*|at\s+least)?\s*(\d+(?:\.\d+)?)\s*years?", m)
    if exp_match:
        extras["min_experience"] = float(exp_match.group(1))
        return "search_experience", extras

    # employee_list_lookup: is X in the employee list, find employee X (before employee_list_who/count)
    if any(x in m for x in ["is ", " in the employee list", "in the list", "find employee ", "email in the list"]):
        # Try to extract name or email (simple: take a quoted string or last significant phrase)
        quoted = re.search(r'["\']([^"\']+)["\']', m)
        if quoted:
            extras["lookup"] = quoted.group(1).strip()
        else:
            for prefix in ("is ", "find employee ", "is this email ", "email "):
                if m.startswith(prefix) or prefix in m:
                    rest = m.replace(prefix, "").replace(" in the employee list", "").replace(" in the list", "").strip()
                    if len(rest) > 1:
                        extras["lookup"] = rest
                        break
        if extras.get("lookup"):
            return "employee_list_lookup", extras

    # employee_list_count
    if any(x in m for x in ["how many employees", "employee list count", "csv count", "number of employees in the list"]):
        return "employee_list_count", extras

    # employee_list_who
    if any(x in m for x in ["who is in the employee list", "list employees", "show employee csv", "who are in the list"]):
        return "employee_list_who", extras

    # how_to_add_resume
    if any(x in m for x in ["how to add resume", "upload resume", "add new resume", "how do i add a resume"]):
        return "how_to_add_resume", extras

    # what_is_employee_list
    if any(x in m for x in ["what is employee list", "employee list verification", "what is the employee list"]):
        return "what_is_employee_list", extras

    # what_is_search_talent
    if any(x in m for x in ["what is search talent", "how to search talent", "search talent"]):
        return "what_is_search_talent", extras

    # dashboard_stats
    if any(x in m for x in ["how many resumes", "total candidates", "dashboard stats", "how many candidates", "total resumes"]):
        return "dashboard_stats", extras

    # list_skills_available
    if any(x in m for x in ["what skills can i search", "available skills", "which skills"]):
        return "list_skills_available", extras

    # ready_to_relocate: open to relocate, ready to relocate, who can relocate
    if any(x in m for x in [
        "open to relocate", "ready to relocate", "ready for relocate", "who can relocate",
        "people who are open to relocate", "candidates open to relocate", "how many ready to relocate",
        "who is open to relocate", "list people open to relocate", "relocate"
    ]):
        return "ready_to_relocate", extras

    # search_by_role: role X, candidates by role, how many SDEs, Data Engineers
    if any(x in m for x in [" by role", "role ", "how many sde", "how many data engineer", "candidates with role", "people with role", "who is sde", "who is developer"]) or re.search(r"\b(sde|devops|data engineer|developer|analyst|engineer)\b", m):
        for pat in [r"role\s+([a-z0-9\s&]+?)(?:\s+in\s|$)", r"(?:how many|list|show)\s+([a-z0-9\s&]+?)(?:\s+candidates?|\s+people|\s*$)", r"(?:in|with)\s+role\s+([a-z0-9\s&]+)"]:
            match = re.search(pat, m, re.I)
            if match:
                kw = match.group(1).strip()
                if len(kw) >= 2:
                    extras["role"] = kw
                    break
        if not extras.get("role"):
            extras["role"] = "any"
        return "search_by_role", extras

    # search_by_location: location X, who is in Bangalore, candidates in Mumbai
    if any(x in m for x in ["location", " in ", "who is in", "candidates in", "people in", "based in", "from "]):
        for pat in [r"in\s+([a-z0-9\s,]+?)(?:\s+(?:and|or)\s|\s*$)", r"location\s+([a-z0-9\s,]+)", r"from\s+([a-z0-9\s,]+)", r"(?:based\s+in|people\s+in)\s+([a-z0-9\s,]+)"]:
            match = re.search(pat, m, re.I)
            if match:
                kw = match.group(1).strip()
                if len(kw) >= 2:
                    extras["location"] = kw
                    break
        if not extras.get("location"):
            extras["location"] = "any"
        return "search_by_location", extras

    # search_by_notice: notice period, immediate joiners, 30 days notice
    if any(x in m for x in ["notice", "immediate", "joiner", "days notice", "notice period"]):
        if "immediate" in m or "0 day" in m or "0d" in m:
            extras["notice"] = "immediate"
        else:
            nd = re.search(r"(\d+)\s*(?:day|days|d)\s*notice?", m, re.I)
            extras["notice"] = int(nd.group(1)) if nd else "any"
        return "search_by_notice", extras

    # search_by_certification: who has certification X, certified
    if any(x in m for x in ["certification", "certified", "certificate", "who has cert"]):
        cert_kw = re.search(r"cert(?:ification)?\s+(?:in\s+)?([a-z0-9\s]+?)(?:\s*$|\s+candidates?)", m, re.I)
        if cert_kw:
            extras["cert"] = cert_kw.group(1).strip()
        else:
            extras["cert"] = "any"
        return "search_by_certification", extras

    # search_by_type: Company Employee, Freelancer, Guest User, how many by type
    if any(x in m for x in ["company employee", "freelancer", "guest user", "by type", "user type", "how many admin"]):
        for ut in ["company employee", "freelancer", "guest user", "admin", "admin uploads"]:
            if ut in m:
                extras["user_type"] = ut
                return "search_by_type", extras
        extras["user_type"] = "any"
        return "search_by_type", extras

    # search_by_links: who has LinkedIn, portfolio, links
    if any(x in m for x in ["linkedin", "portfolio", "who has link", "candidates with link"]):
        extras["link"] = "linkedin" if "linkedin" in m else ("portfolio" if "portfolio" in m else "any")
        return "search_by_links", extras

    return "fallback", extras


# --- Static answers ---
STATIC_ANSWERS = {
    "how_to_add_resume": "Go to the **Add New Resume** tab, then upload one or more PDF or DOCX files. Resumes are parsed and stored in the database. You can also use **Search Talent** to find them later.",
    "what_is_employee_list": "The **Employee List** is the CSV/Excel list of company employees (employee_id, full_name, email) that you upload in the **Employee List** tab. It is used for **Company Employee verification** during signup. When you replace the CSV, the list updates and the assistant always shows the latest count and names.",
    "what_is_search_talent": "**Search Talent** lets you find candidates by skills, experience, location, role, and user type. Use the filters and click Search. You can combine multiple criteria.",
    "list_skills_available": "You can search by any skill that appears in resumes, for example: Python, Java, SQL, React, AWS, JavaScript, C++, Excel, PowerBI, AI/ML, and more. Try: \"Find people with Python and SQL\".",
    "fallback": (
        "I'm not able to answer that from the data I have. Here's how you can navigate the platform:\n\n"
        "• **Dashboard** - Open from the top navbar for overview and stats.\n"
        "• **Search Talent** - Use the tab in the navbar to search by skills, location, experience, role; set filters and click Search.\n"
        "• **Records** - In the admin top bar, go to **Records** to view all candidate records.\n"
        "• **Add New Resume** - Tab in the navbar; upload PDF or DOCX resumes there.\n"
        "• **Employee List** - Tab in the navbar to upload or replace the company employee CSV.\n"
        "• **Users** (Admin only) - Manage platform users from the admin area.\n\n"
        "You can access these from the top navbar. Go there to find what you need."
    ),
}


# --- Handlers (use DB session, return reply string and optional data) ---
async def handle_search_skills(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    from sqlalchemy.orm import selectinload

    skills = extras.get("skills") or []
    if not skills:
        return "Please specify at least one skill, e.g. \"Find people with Python and SQL\".", None

    query = (
        select(Resume)
        .options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations),
        )
    )
    for skill in skills:
        escaped = escape_like_pattern(skill.lower())
        query = query.where(
            func.lower(func.coalesce(func.array_to_string(Resume.skills, ","), "")).like(f"%{escaped}%", escape="\\")
        )
    query = query.order_by(Resume.uploaded_at.desc()).limit(50)
    result = await db.execute(query)
    resumes = result.scalars().all()
    formatted = [format_resume_response(r) for r in resumes]

    if not formatted:
        return f"No one found with skill(s): {', '.join(skills)}. Try different skills or check **Search Talent**.", None

    skill_str = ", ".join(skills)
    lines = []
    for i, r in enumerate(formatted[:15], 1):
        name = (r.get("candidate_name") or r.get("parsed_data", {}).get("resume_candidate_name") or "Unknown").strip()
        sks = r.get("skills") or []
        sks_str = ", ".join(sks[:8]) if sks else "-"
        lines.append(f"{i}) {name} (skills: {sks_str})")
    reply = f"Found **{len(formatted)}** people with {skill_str}:\n" + "\n".join(lines)
    if len(formatted) > 15:
        reply += f"\n... and {len(formatted) - 15} more."
    reply += "\nYou can open **Search Talent** for more filters."
    return reply, {"count": len(formatted), "skills": skills}


async def handle_search_experience(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    min_exp = extras.get("min_experience") or 0
    from sqlalchemy.orm import selectinload
    query = (
        select(Resume)
        .options(selectinload(Resume.work_history), selectinload(Resume.certificates), selectinload(Resume.educations))
        .order_by(Resume.uploaded_at.desc())
        .limit(500)
    )
    result = await db.execute(query)
    all_resumes = result.scalars().all()
    filtered = []
    for r in all_resumes:
        parsed = r.parsed_data or {}
        raw = r.experience_years if r.experience_years is not None else parsed.get("resume_experience", 0)
        try:
            years = float(raw) if raw not in (None, "") else 0.0
        except (TypeError, ValueError):
            years = 0.0
        if years >= min_exp:
            filtered.append(r)
    formatted = [format_resume_response(r) for r in filtered[:20]]

    if not formatted:
        return f"No candidates found with {min_exp}+ years of experience. Try a lower number or use **Search Talent**.", None

    lines = []
    for i, r in enumerate(formatted[:10], 1):
        name = (r.get("candidate_name") or r.get("parsed_data", {}).get("resume_candidate_name") or "Unknown").strip()
        exp = r.get("experience_years", 0)
        lines.append(f"{i}) {name} ({exp} years)")
    reply = f"Found **{len(filtered)}** candidates with at least {min_exp} years of experience:\n" + "\n".join(lines)
    if len(filtered) > 10:
        reply += f"\n... and {len(filtered) - 10} more. Use **Search Talent** for full list."
    return reply, {"count": len(filtered), "min_experience": min_exp}


async def handle_dashboard_stats(db: AsyncSession) -> tuple[str, dict | None]:
    r_resumes = await db.execute(select(func.count(Resume.id)))
    r_users = await db.execute(select(func.count(User.id)))
    r_employees = await db.execute(select(func.count(CompanyEmployeeList.id)))
    total_resumes = r_resumes.scalar() or 0
    total_users = r_users.scalar() or 0
    total_employees = r_employees.scalar() or 0
    reply = f"**Dashboard stats:** {total_resumes} resumes in the database, {total_users} platform users, and {total_employees} employees in the uploaded company employee list."
    return reply, {"total_resumes": total_resumes, "total_users": total_users, "total_employees": total_employees}


def _resume_ready_to_relocate(r) -> bool:
    """Same logic as format_resume_response: form_data > meta_data > parsed_data."""
    if not r:
        return False
    form = (r.source_metadata or {}).get("form_data") or {}
    if form.get("readyToRelocate") is True:
        return True
    meta = r.meta_data or {}
    if meta.get("ready_to_relocate") is True:
        return True
    if (meta.get("user_profile") or {}).get("ready_to_relocate") is True:
        return True
    parsed = r.parsed_data or {}
    val = parsed.get("ready_to_relocate")
    if val is True:
        return True
    if isinstance(val, str) and val.strip().lower() in ("true", "1", "yes"):
        return True
    return False


async def handle_ready_to_relocate(db: AsyncSession) -> tuple[str, dict | None]:
    from sqlalchemy.orm import selectinload

    query = (
        select(Resume)
        .options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations),
        )
        .order_by(Resume.uploaded_at.desc())
        .limit(1000)
    )
    result = await db.execute(query)
    all_resumes = result.scalars().all()
    ready = [r for r in all_resumes if _resume_ready_to_relocate(r)]

    if not ready:
        return "No candidates in the database are marked as **open to relocate**. You can add or update resumes with relocation preference in **Add New Resume** or user profile.", None

    formatted = [format_resume_response(r) for r in ready[:30]]
    lines = []
    for i, r in enumerate(formatted[:15], 1):
        name = (r.get("name") or r.get("candidate_name") or (r.get("parsed_data") or {}).get("resume_candidate_name") or "Unknown").strip()
        loc = (r.get("preferred_location") or "").strip() or "-"
        lines.append(f"{i}) {name} (preferred location: {loc})")
    reply = f"There are **{len(ready)}** people open to relocate:\n" + "\n".join(lines)
    if len(ready) > 15:
        reply += f"\n... and {len(ready) - 15} more. Use **Search Talent** and filter by relocation for the full list."
    return reply, {"count": len(ready)}


async def _load_resumes_formatted(db: AsyncSession, limit: int = 800) -> list:
    """Load resumes with relationships and return list of formatted dicts (same as Records)."""
    from sqlalchemy.orm import selectinload
    query = (
        select(Resume)
        .options(
            selectinload(Resume.work_history),
            selectinload(Resume.certificates),
            selectinload(Resume.educations),
        )
        .order_by(Resume.uploaded_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    resumes = result.scalars().all()
    return [format_resume_response(r) for r in resumes]


async def handle_search_by_role(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    role_kw = (extras.get("role") or "").strip().lower()
    all_f = await _load_resumes_formatted(db)
    if not role_kw or role_kw == "any":
        # Count by role
        by_role = {}
        for r in all_f:
            role = (r.get("role") or "").strip() or "Not specified"
            by_role[role] = by_role.get(role, 0) + 1
        lines = [f"• **{k}**: {v}" for k, v in sorted(by_role.items(), key=lambda x: -x[1])[:15]]
        return "**Candidates by role:**\n" + "\n".join(lines) + "\n\nUse **Records** or **Search Talent** for full details.", {"by_role": by_role}
    matched = [r for r in all_f if role_kw in ((r.get("role") or "").lower())]
    if not matched:
        return f"No candidates found with role containing \"{role_kw}\". Try **Search Talent** or **Records** and filter by Role.", None
    lines = [f"{i}) {r.get('name', 'Unknown')} ({r.get('role', '-')})" for i, r in enumerate(matched[:15], 1)]
    reply = f"Found **{len(matched)}** candidates with role matching \"{role_kw}\":\n" + "\n".join(lines)
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records** for full list."
    return reply, {"count": len(matched), "role": role_kw}


async def handle_search_by_location(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    loc_kw = (extras.get("location") or "any").strip().lower()
    all_f = await _load_resumes_formatted(db)
    if not loc_kw or loc_kw == "any":
        # Count by location
        by_loc = {}
        for r in all_f:
            loc = (r.get("location") or r.get("preferred_location") or "").strip() or "Not specified"
            by_loc[loc] = by_loc.get(loc, 0) + 1
        lines = [f"• **{k}**: {v}" for k, v in sorted(by_loc.items(), key=lambda x: -x[1])[:15]]
        return "**Candidates by location:**\n" + "\n".join(lines) + "\n\nUse **Records** for full details.", {"by_location": by_loc}
    matched = [r for r in all_f if loc_kw in ((r.get("location") or "").lower()) or loc_kw in ((r.get("preferred_location") or "").lower())]
    if not matched:
        return f"No candidates found in \"{loc_kw}\". Try **Search Talent** (Location filter) or **Records**.", None
    lines = [f"{i}) {r.get('name', 'Unknown')} ({r.get('location') or r.get('preferred_location') or '-'})" for i, r in enumerate(matched[:15], 1)]
    reply = f"Found **{len(matched)}** candidates in/for \"{loc_kw}\":\n" + "\n".join(lines)
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records**."
    return reply, {"count": len(matched), "location": loc_kw}


async def handle_search_by_notice(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    notice_val = extras.get("notice")
    all_f = await _load_resumes_formatted(db)
    if notice_val == "immediate":
        matched = [r for r in all_f if (r.get("notice_period") or 0) == 0]
        if not matched:
            return "No candidates with **immediate** notice period in the database. Check **Records** or **Search Talent**.", None
        lines = [f"{i}) {r.get('name', 'Unknown')}" for i, r in enumerate(matched[:15], 1)]
        reply = f"Found **{len(matched)}** candidates with **immediate** (0 days) notice:\n" + "\n".join(lines)
    elif isinstance(notice_val, int):
        matched = [r for r in all_f if (r.get("notice_period") or 0) == notice_val]
        if not matched:
            return f"No candidates with **{notice_val} days** notice. Try **Records** (Notice column).", None
        lines = [f"{i}) {r.get('name', 'Unknown')} ({r.get('notice_period', 0)} days)" for i, r in enumerate(matched[:15], 1)]
        reply = f"Found **{len(matched)}** candidates with **{notice_val} days** notice:\n" + "\n".join(lines)
    else:
        # Any: show distribution
        by_notice = {}
        for r in all_f:
            n = r.get("notice_period")
            if n is None:
                n = "Not specified"
            by_notice[str(n)] = by_notice.get(str(n), 0) + 1
        lines = [f"• **{k} days**: {v}" for k, v in sorted(by_notice.items(), key=lambda x: (-x[1] if x[0] != "Not specified" else 0))[:12]]
        return "**Candidates by notice period:**\n" + "\n".join(lines) + "\n\nUse **Records** (Notice column) for full list.", {"by_notice": by_notice}
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records**."
    return reply, {"count": len(matched)}


async def handle_search_by_certification(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    cert_kw = (extras.get("cert") or "any").strip().lower()
    all_f = await _load_resumes_formatted(db)
    if not cert_kw or cert_kw == "any":
        with_certs = [r for r in all_f if (r.get("certificates") or [])]
        if not with_certs:
            return "No candidates with **certifications** in the database. Use **Records** (Certifications column).", None
        lines = [f"{i}) {r.get('name', 'Unknown')} ({len(r.get('certificates', []))} certs)" for i, r in enumerate(with_certs[:15], 1)]
        reply = f"Found **{len(with_certs)}** candidates with certifications:\n" + "\n".join(lines)
        if len(with_certs) > 15:
            reply += f"\n... and {len(with_certs) - 15} more. See **Records**."
        return reply, {"count": len(with_certs)}
    matched = [r for r in all_f if any(cert_kw in (c.get("name") or "").lower() for c in (r.get("certificates") or []))]
    if not matched:
        return f"No candidates found with certification containing \"{cert_kw}\". Try **Records** (Certifications column).", None
    lines = [f"{i}) {r.get('name', 'Unknown')}" for i, r in enumerate(matched[:15], 1)]
    reply = f"Found **{len(matched)}** candidates with certification matching \"{cert_kw}\":\n" + "\n".join(lines)
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records**."
    return reply, {"count": len(matched)}


async def handle_search_by_type(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    ut = (extras.get("user_type") or "any").strip().lower()
    all_f = await _load_resumes_formatted(db)
    type_map = {"company employee": "Company Employee", "freelancer": "Freelancer", "guest user": "Guest User", "admin": "Admin Uploads", "admin uploads": "Admin Uploads"}
    if not ut or ut == "any":
        by_type = {}
        for r in all_f:
            t = (r.get("user_type") or r.get("meta_data", {}).get("user_type") or "Other").strip()
            by_type[t] = by_type.get(t, 0) + 1
        lines = [f"• **{k}**: {v}" for k, v in sorted(by_type.items(), key=lambda x: -x[1])]
        return "**Candidates by type:**\n" + "\n".join(lines) + "\n\nUse **Records** (Type column).", {"by_type": by_type}
    norm = type_map.get(ut, ut.title())
    matched = [r for r in all_f if (r.get("user_type") or "").lower() == norm.lower()]
    if not matched:
        return f"No candidates found with type \"{norm}\". Check **Records** (Type column).", None
    lines = [f"{i}) {r.get('name', 'Unknown')} ({r.get('user_type', '-')})" for i, r in enumerate(matched[:15], 1)]
    reply = f"Found **{len(matched)}** candidates of type **{norm}**:\n" + "\n".join(lines)
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records**."
    return reply, {"count": len(matched), "user_type": norm}


async def handle_search_by_links(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    link_type = (extras.get("link") or "any").strip().lower()
    all_f = await _load_resumes_formatted(db)
    if link_type == "linkedin":
        matched = [r for r in all_f if (r.get("linked_in") or "").strip()]
    elif link_type == "portfolio":
        matched = [r for r in all_f if (r.get("portfolio") or "").strip()]
    else:
        matched = [r for r in all_f if (r.get("linked_in") or "").strip() or (r.get("portfolio") or "").strip()]
    if not matched:
        msg = "No candidates with **LinkedIn** or **portfolio** links in the database." if link_type == "any" else f"No candidates with **{link_type}** link in the database."
        return msg + " Use **Records** (Links column).", None
    lines = [f"{i}) {r.get('name', 'Unknown')}" for i, r in enumerate(matched[:15], 1)]
    reply = f"Found **{len(matched)}** candidates with profile links:\n" + "\n".join(lines)
    if len(matched) > 15:
        reply += f"\n... and {len(matched) - 15} more. See **Records**."
    return reply, {"count": len(matched)}


async def handle_employee_list_count(db: AsyncSession) -> tuple[str, dict | None]:
    config = await get_employee_list_config(db)
    count = config.get("count", 0)
    enabled = config.get("enabled", True)
    reply = f"The uploaded employee list has **{count}** employees. Verification is {'on' if enabled else 'off'}."
    return reply, {"count": count, "enabled": enabled}


async def handle_employee_list_who(db: AsyncSession) -> tuple[str, dict | None]:
    result = await db.execute(
        select(CompanyEmployeeList).order_by(CompanyEmployeeList.employee_id).limit(100)
    )
    rows = result.scalars().all()
    if not rows:
        return "The employee list is empty. Upload a CSV in the **Employee List** tab (columns: employee_id, full_name, email).", None
    lines = [f"{i}) {r.full_name or '-'} ({r.email})" for i, r in enumerate(rows[:25], 1)]
    reply = f"There are **{len(rows)}** employees in the list (showing up to 25):\n" + "\n".join(lines)
    if len(rows) >= 100:
        reply += "\n... and more. Open **Employee List** tab to see all."
    return reply, {"total_shown": len(rows)}


async def handle_employee_list_lookup(db: AsyncSession, extras: dict) -> tuple[str, dict | None]:
    lookup = (extras.get("lookup") or "").strip()
    if not lookup or len(lookup) < 2:
        return "Please specify a name or email to look up, e.g. \"Is john@company.com in the employee list?\"", None

    lookup_lower = lookup.lower()
    result = await db.execute(
        select(CompanyEmployeeList).where(
            or_(
                func.lower(CompanyEmployeeList.email).like(f"%{escape_like_pattern(lookup_lower)}%"),
                func.lower(CompanyEmployeeList.full_name or "").like(f"%{escape_like_pattern(lookup_lower)}%"),
                func.lower(CompanyEmployeeList.employee_id or "").like(f"%{escape_like_pattern(lookup_lower)}%"),
            )
        ).limit(10)
    )
    rows = result.scalars().all()
    if not rows:
        return f"**{lookup}** was not found in the employee list. The list updates when you upload a new CSV in the **Employee List** tab.", None
    if len(rows) == 1:
        r = rows[0]
        return f"Yes, **{r.full_name or r.email}** is in the employee list (employee_id: {r.employee_id}, email: {r.email}).", None
    lines = [f"• {r.full_name or '-'} ({r.email}, id: {r.employee_id})" for r in rows[:5]]
    return f"Found **{len(rows)}** matches for \"{lookup}\":\n" + "\n".join(lines), None


class AssistantQueryRequest(BaseModel):
    message: str


class AssistantQueryResponse(BaseModel):
    reply: str
    data: dict | None = None


@router.post("/query", response_model=AssistantQueryResponse)
async def assistant_query(
    body: AssistantQueryRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_postgres_db),
):
    """Intent-based help assistant. No OpenAI, no knowledge base. Uses live DB and employee list."""
    if not body.message or not body.message.strip():
        return AssistantQueryResponse(reply="Please type a question. I answer from the database when I can (e.g. skills, relocate, employee list, stats). If I can't, I'll ask you to explore the platform.", data=None)

    intent, extras = _detect_intent(body.message)
    reply = ""
    data = None

    try:
        if intent == "search_skills":
            reply, data = await handle_search_skills(db, extras)
        elif intent == "search_experience":
            reply, data = await handle_search_experience(db, extras)
        elif intent == "dashboard_stats":
            reply, data = await handle_dashboard_stats(db)
        elif intent == "employee_list_count":
            reply, data = await handle_employee_list_count(db)
        elif intent == "employee_list_who":
            reply, data = await handle_employee_list_who(db)
        elif intent == "employee_list_lookup":
            reply, data = await handle_employee_list_lookup(db, extras)
        elif intent == "ready_to_relocate":
            reply, data = await handle_ready_to_relocate(db)
        elif intent == "search_by_role":
            reply, data = await handle_search_by_role(db, extras)
        elif intent == "search_by_location":
            reply, data = await handle_search_by_location(db, extras)
        elif intent == "search_by_notice":
            reply, data = await handle_search_by_notice(db, extras)
        elif intent == "search_by_certification":
            reply, data = await handle_search_by_certification(db, extras)
        elif intent == "search_by_type":
            reply, data = await handle_search_by_type(db, extras)
        elif intent == "search_by_links":
            reply, data = await handle_search_by_links(db, extras)
        elif intent in STATIC_ANSWERS:
            reply = STATIC_ANSWERS[intent]
        else:
            reply = STATIC_ANSWERS["fallback"]

        # Optional: convert **bold** to HTML or leave as-is for frontend to render
        return AssistantQueryResponse(reply=reply, data=data)
    except Exception as e:
        logger.exception("Assistant query error")
        return AssistantQueryResponse(
            reply=f"Something went wrong: {str(e)}. Please try again or rephrase.",
            data=None,
        )
