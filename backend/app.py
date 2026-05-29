from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from starlette.responses import JSONResponse

# Load environment variables
load_dotenv()

# Import database config
from config.database import init_postgres_db

# Import routes
from routes import auth, resume, jd_analysis, admin
from routes.resumes import company, admin as resume_admin, user_profile, gmail

# Import logger
from utils.logger import get_logger

logger = get_logger(__name__)

# Lifespan context manager for startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting SkillVault Backend...")
    
    # Initialize PostgreSQL tables (includes users, resumes, jd_analysis, etc.)
    await init_postgres_db()
    
    logger.info("PostgreSQL database initialized")
    logger.info(f"Server running on http://{os.getenv('HOST', '0.0.0.0')}:{os.getenv('PORT', '8000')}")
    
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

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (for serving uploaded files)
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(auth.router)
app.include_router(resume.router)  # Main resume routes (search, list, get, delete)
app.include_router(company.router)  # Company employee uploads
app.include_router(resume_admin.router)  # Admin bulk uploads
app.include_router(user_profile.router)  # User profile uploads
app.include_router(gmail.router)  # Gmail webhook
app.include_router(jd_analysis.router)
app.include_router(admin.router)
# Employee list config and CSV upload (admin) - from src so both app.py and src.main have it
try:
    from src.routes import employee_list
    app.include_router(employee_list.router)
except ImportError:
    pass

# Simple request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Completed {request.method} {request.url.path} -> {response.status_code}")
    return response

# Centralized exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail or "HTTP error"},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "SkillVault Backend",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to SkillVault API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "features": [
            "User Authentication (JWT)",
            "Resume Upload & Parsing (AI-Powered)",
            "JD Analysis & Matching (GPT-4)",
            "Intelligent Candidate Scoring",
            "Admin Dashboard"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=False,  # Disabled to prevent continuous file watching noise
        log_level="info"
    )
