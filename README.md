# SkillVault - Resume Screening Platform

AI-Powered Resume Management and Job Description Analysis System

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Start Services

**Terminal 1 - Backend:**
```powershell
.\start-backend.ps1
```
Backend runs on: **http://localhost:5000**

**Terminal 2 - Frontend:**
```powershell
.\start-frontend.ps1
```
Frontend runs on: **http://localhost:5173**

### Access URLs
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Docs**: http://localhost:5000/docs
- **Health Check**: http://localhost:5000/health

---

## 📋 Port Configuration

- **Backend Port**: 5000
- **Frontend Port**: 5173
- **API Base URL**: http://localhost:5000/api

---

## 🔧 Setup

### Backend Setup
1. Navigate to backend directory:
   ```powershell
   cd backend
   ```

2. Create virtual environment:
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   ```

3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

4. Configure environment:
   - Copy `.env.example` to `.env` (if exists)
   - Or create `.env` with:
     ```
     POSTGRES_HOST=localhost
     POSTGRES_PORT=5432
     POSTGRES_DB=techbank
     POSTGRES_USER=postgres
     POSTGRES_PASSWORD=postgres
     PORT=5000
     CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:3001
     ```

5. Start backend:
   ```powershell
   python -m src.main
   ```

### Frontend Setup
1. Navigate to frontend directory:
   ```powershell
   cd frontend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Start frontend:
   ```powershell
   npm run dev
   ```

---

## ✅ Features

- ✅ User Authentication (Login/Signup/Logout)
- ✅ Resume Upload & Parsing
- ✅ Job Description Analysis
- ✅ Smart Candidate Matching
- ✅ Admin Dashboard
- ✅ Talent Search
- ✅ Database Integration (PostgreSQL)
- ✅ JWT Authentication
- ✅ File Upload (PDF/DOCX)

---

## 🔗 Integration Status

### Fully Integrated
- ✅ Login/Signup/Logout APIs
- ✅ Resume Upload API
- ✅ Admin Dashboard API
- ✅ Talent Search API
- ✅ All mock data removed
- ✅ Real API calls working

### API Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `POST /api/auth/logout` - User logout
- `POST /api/resumes/upload/user-profile` - Upload resume
- `GET /api/resumes/search` - Search resumes
- `GET /api/admin/stats` - Admin statistics
- `GET /health` - Health check

---

## 🐳 Docker and production

- **Full stack (dev):** `docker compose up --build` - app at http://localhost (see [docker-compose.yml](docker-compose.yml)).
- **Production:** See [docs/production.md](docs/production.md) for secrets, HTTPS, backups, and running with `docker-compose.prod.yml`.

---

## 🐛 Troubleshooting

### White Page Issue
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify backend is running: `http://localhost:5000/health`
4. Check Network tab for failed API calls
5. Clear browser cache (Ctrl+Shift+Delete)

### Backend Not Starting
1. Check if port 5000 is in use:
   ```powershell
   netstat -ano | findstr ":5000"
   ```
2. Kill process if needed:
   ```powershell
   .\kill-port-8000.ps1
   ```
3. Verify PostgreSQL is running
4. Check `.env` file configuration

### Frontend Not Starting
1. Verify node_modules installed:
   ```powershell
   cd frontend
   npm install
   ```
2. Check if port 5173 is available
3. Clear node cache:
   ```powershell
   npm cache clean --force
   ```

### Database Connection Issues
1. Verify PostgreSQL is running
2. Check database credentials in `.env`
3. Test connection:
   ```powershell
   psql -h localhost -U postgres -d techbank
   ```

### API Errors
1. Verify backend is running on port 5000
2. Check CORS configuration
3. Verify API_BASE_URL in `frontend/src/config/api.js`
4. Check browser console for CORS errors

---

## 🧪 Testing

### Test Backend
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing
```

### Test Frontend
Open http://localhost:5173 in browser

### Test API Connection
Open browser console and run:
```javascript
fetch('http://localhost:5000/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

### Test Authentication
1. Open http://localhost:5173
2. Click "Sign Up"
3. Create account
4. Login with credentials
5. Verify redirect to dashboard

---

## 📁 Project Structure

```
Bank.Ai/
├── backend/
│   ├── src/              # Main backend code
│   │   ├── main.py      # Entry point
│   │   ├── config/      # Configuration
│   │   ├── routes/      # API routes
│   │   ├── models/      # Database models
│   │   ├── services/    # Business logic
│   │   └── utils/       # Utilities
│   ├── requirements.txt  # Python dependencies
│   └── .env             # Environment variables
│
├── frontend/
│   ├── src/             # Main frontend code
│   │   ├── main.jsx     # Entry point
│   │   ├── App.jsx      # App component
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── config/      # Configuration
│   │   └── context/     # React context
│   ├── package.json     # Node dependencies
│   └── vite.config.js   # Vite configuration
│
├── start-backend.ps1    # Backend startup script
├── start-frontend.ps1    # Frontend startup script
├── kill-port-8000.ps1   # Port cleanup utility
└── README.md            # This file
```

---

## 🔐 Environment Variables

### Backend (.env)
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=techbank
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Server
HOST=0.0.0.0
PORT=5000

# JWT
JWT_SECRET_KEY=your-secret-key-change-this
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# OpenAI (optional)
OPENAI_API_KEY=your-openai-api-key

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:3001
```

---

## 📝 Notes

- First page is Login (root "/" redirects to "/login")
- All data is stored in PostgreSQL
- JWT tokens stored in localStorage
- File uploads stored in `backend/uploads/`
- Backend uses `backend/src/` structure (ignore duplicate folders)

---

## 🆘 Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify both services are running
3. Check `README.md` troubleshooting section
4. Verify database connection
5. Check API endpoints in browser Network tab

---

**Last Updated**: System fully integrated and tested
**Status**: ✅ Ready for use













