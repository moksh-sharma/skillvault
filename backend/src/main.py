"""Main FastAPI application entry point."""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from starlette.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Load environment variables
load_dotenv()

# Import database config
from src.config.database import init_postgres_db
from src.config.settings import settings

# Import routes
from src.routes import auth, resume, jd_analysis, admin, job_openings, assistant
from src.routes.resumes import company, admin as resume_admin, user_profile, gmail, outlook
from src.routes import user_profile_api

# Import logger and middleware
from src.utils.logger import get_logger
from src.middleware.error_middleware import TraceIDMiddleware, create_error_response
from src.middleware.security_middleware import SecurityHeadersMiddleware

logger = get_logger(__name__)

# Lifespan context manager for startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting SkillVault Backend...")
    
    # Initialize PostgreSQL tables (includes users, resumes, jd_analysis, etc.)
    await init_postgres_db()
    
    logger.info("PostgreSQL database initialized")
    logger.info(f"Server running on http://{settings.host}:{settings.port}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down SkillVault Backend...")
    logger.info("Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="SkillVault API",
    description="AI-Powered Resume Management and JD Analysis System",
    version="1.0.0",
    lifespan=lifespan
)

# Add security headers middleware (before other middleware)
app.add_middleware(SecurityHeadersMiddleware)

# Add trace ID middleware after security headers
app.add_middleware(TraceIDMiddleware)

# CORS Configuration
# Use environment-based allowed origins if specified, otherwise allow all
# CRITICAL: Added LAST to ensure it is the OUTERMOST layer for preflight requests
cors_origins_str = settings.cors_origins
if cors_origins_str and cors_origins_str != "*":
    # Parse comma-separated origins into a list
    cors_origins_list = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]
    if cors_origins_list:
        # Use specific origins list for better security
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins_list,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            allow_headers=["*"],
            max_age=3600,
        )
    else:
        # Fallback to allow all origins if parsing fails
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=".*",  # Allows all origins
            allow_credentials=True,   # Allows cookies and auth headers
            allow_methods=["*"],      # Allows all methods
            allow_headers=["*"],      # Allows all headers
            max_age=3600,
        )
else:
    # Fallback to allow all origins (for development)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",  # Allows all origins
        allow_credentials=True,   # Allows cookies and auth headers
        allow_methods=["*"],      # Allows all methods
        allow_headers=["*"],      # Allows all headers
        max_age=3600,
    )

# Mount static files (for serving uploaded files)
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(auth.router)

# CRITICAL: Register parse-only route directly on app BEFORE including resume router
# This ensures it's matched before any parameterized routes like /{resume_id}
from src.routes.resume import parse_resume_only

# Register the route directly on app to ensure it's matched first
app.add_api_route(
    "/api/resumes/parse-only",
    parse_resume_only,
    methods=["POST"],
    status_code=200,
    summary="Parse Resume for Autofill",
    description="Parse resume and return extracted data without saving to database. Used for autofilling form fields in the frontend. No authentication required. Works for all user types: Company Employee, Freelancer, and Guest User.",
    tags=["Resumes"],
    response_description="Parsed resume data for autofill"
)

# Add backward compatibility route for old /resumes/{filename} URLs
from src.routes.resume import get_resume_by_filename
app.add_api_route(
    "/resumes/{filename:path}",
    get_resume_by_filename,
    methods=["GET"],
    tags=["Resumes"],
    summary="Get Resume by Filename (Legacy)",
    description="Backward compatibility route for old resume URLs"
)

app.include_router(resume.router)  # Main resume routes (search, list, get, delete)
app.include_router(company.router)  # Company employee uploads
app.include_router(resume_admin.router)  # Admin bulk uploads
app.include_router(user_profile.router)  # User profile uploads
app.include_router(gmail.router)  # Gmail webhook
app.include_router(outlook.router)  # Outlook trigger
app.include_router(jd_analysis.router)
app.include_router(admin.router)
app.include_router(assistant.router)
# Employee list: register routes explicitly on app so path is guaranteed
from src.routes.employee_list import (
    get_config as employee_list_get_config,
    update_config as employee_list_update_config,
    upload_csv as employee_list_upload_csv,
    list_employees as employee_list_list_employees,
    get_left_after_upload as employee_list_get_left_after_upload,
    downgrade_left_employees as employee_list_downgrade_left,
)
app.add_api_route("/api/admin/employee-list/config", employee_list_get_config, methods=["GET"], tags=["Admin - Employee List"])
app.add_api_route("/api/admin/employee-list/config", employee_list_update_config, methods=["PUT"], tags=["Admin - Employee List"])
app.add_api_route("/api/admin/employee-list/upload", employee_list_upload_csv, methods=["POST"], tags=["Admin - Employee List"])
app.add_api_route("/api/admin/employee-list/left-after-upload", employee_list_get_left_after_upload, methods=["GET"], tags=["Admin - Employee List"])
app.add_api_route("/api/admin/employee-list", employee_list_list_employees, methods=["GET"], tags=["Admin - Employee List"])
app.add_api_route("/api/admin/employee-list/downgrade-left", employee_list_downgrade_left, methods=["POST"], tags=["Admin - Employee List"])
app.include_router(user_profile_api.router)
app.include_router(job_openings.router)

# Debug: Log assistant and resume routes
logger.info("Assistant: POST /api/assistant/query registered")
logger.info("Registered routes for /api/resumes:")
for route in app.routes:
    if hasattr(route, 'path') and '/api/resumes' in route.path:
        methods = getattr(route, 'methods', set())
        logger.info(f"  {route.path} - Methods: {methods}")
        if 'parse-only' in route.path:
            logger.info(f"  [OK] FOUND parse-only route: {route.path} with methods: {methods}")

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests."""
    trace_id = getattr(request.state, 'trace_id', 'N/A')
    logger.info(f"{request.method} {request.url.path} [Trace: {trace_id}]")
    try:
        response = await call_next(request)
        logger.info(f"Completed {request.method} {request.url.path} -> {response.status_code} [Trace: {trace_id}]")
        return response
    except Exception as e:
        logger.error(f"Error handling {request.method} {request.url.path} [Trace: {trace_id}]: {e}")
        raise


# Centralized exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    trace_id = getattr(request.state, 'trace_id', None)
    return create_error_response(
        status_code=exc.status_code,
        message=exc.detail or "HTTP error",
        trace_id=trace_id
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, 'trace_id', None)
    logger.error(f"Unhandled error on {request.url.path} [Trace: {trace_id}]: {exc}")
    return create_error_response(
        status_code=500,
        message="Internal server error",
        trace_id=trace_id
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "SkillVault Backend",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to SkillVault API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "features": [
            "User Authentication (JWT)",
            "Resume Upload & Parsing (AI-Powered)",
            "JD Analysis & Matching (Ollama)",
            "Intelligent Candidate Scoring",
            "Admin Dashboard"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,  # Disabled to reduce file watching noise - restart server manually after code changes
        log_level="info"
    )

