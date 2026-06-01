# 🚀 How to Run Backend and Frontend

Complete guide to properly start and run both services.

## 📋 Prerequisites

### Required Software
- ✅ **Python 3.11+** - For backend
- ✅ **Node.js 18+** - For frontend
- ✅ **PostgreSQL 15+** - Database (running on localhost:5432)
- ✅ **Ollama Endpoint** - For AI features (optional but recommended)

### Check Versions
```bash
# Check Python
python --version  # Should be 3.11+

# Check Node.js
node --version  # Should be 18+

# Check PostgreSQL (if installed locally)
psql --version
```

---

## 🔧 Backend Setup

### Step 1: Navigate to Backend Directory
```bash
cd backend
```

### Step 2: Create Virtual Environment (First Time Only)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies (First Time Only)
```bash
pip install -r requirements.txt
```

### Step 4: Configure Environment Variables

Create `.env` file in `backend/` directory:

```env
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=techbank
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password

# Server Configuration
HOST=0.0.0.0
PORT=8000

# JWT Configuration
JWT_SECRET_KEY=your-secret-key-change-this-to-random-string
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Ollama Configuration (Required for AI features)
OLLAMA_BASE_URL=http://172.16.200.30:11434
OLLAMA_MODEL=llama3.1:latest
OLLAMA_MAX_TOKENS=10000

# CORS Configuration (Allow frontend to connect)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# File Upload Configuration
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10

# Google Drive (Optional)
USE_GOOGLE_DRIVE=false
GOOGLE_DRIVE_CREDENTIALS_PATH=
GOOGLE_DRIVE_FOLDER_ID=

# Celery/Redis (Optional - for background tasks)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

**⚠️ Important:**
- Replace `your_postgres_password` with your actual PostgreSQL password
- Replace `your-secret-key-change-this-to-random-string` with a secure random string
- Ensure your Ollama endpoint/model are reachable for AI features to work

### Step 5: Ensure PostgreSQL is Running

**Local PostgreSQL**
```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database
CREATE DATABASE techbank;

-- Exit
\q
```

### Step 6: Start Backend Server

**Method 1: Using Python Module (Recommended)**
```bash
# Make sure virtual environment is activated
python -m src.main
```

**Method 2: Using Uvicorn Directly**
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

**Expected Output:**
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     PostgreSQL database initialized
INFO:     Server running on http://0.0.0.0:8000
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**✅ Backend is running when you see:**
- Server running on http://0.0.0.0:8000
- No error messages
- You can access http://localhost:8000/health

**Test Backend:**
```bash
# Open in browser or use curl
curl http://localhost:8000/health
# Should return: {"status":"healthy","service":"TechBank.ai Backend","version":"1.0.0"}
```

---

## 🎨 Frontend Setup

### Step 1: Navigate to Frontend Directory
```bash
cd frontend
```

### Step 2: Install Dependencies (First Time Only)
```bash
npm install
```

### Step 3: Configure Environment Variables (Optional)

Create `.env` file in `frontend/` directory (optional):

```env
# API base (Vite). Optional - see frontend/.env.example
# Direct dev on :3005 defaults to http://<hostname>:8000/api
# Behind nginx on :80, omit this so the app uses same-origin /api
# VITE_API_URL=http://127.0.0.1:8002/api
```

**Note:** If unset, the app picks the API URL from the current page (see `frontend/src/config/api.js`).

### Step 4: Start Frontend Development Server

**Direct (URL shows `:3005`):**
```bash
npm run dev
```

**Clean URL (no port in the address bar - `http://127.0.0.1/`):**

Vite still listens on **3005** internally; **nginx** on port **80** proxies to it so the browser never shows `:3005`.

1. Start backend on `0.0.0.0` (e.g. port **8002** - must match `api_dev` in `nginx/nginx.host-dev-native.conf`).
2. **Native nginx on Windows (no Docker):** install nginx (`winget install nginxinc.nginx`), then from repo root:
   ```powershell
   .\scripts\start-nginx-local-reverse-proxy.ps1
   ```
   Config: **`nginx/nginx.host-dev-native.conf`**. Reload after edits: `.\scripts\start-nginx-local-reverse-proxy.ps1 -Reload`. Stop: `-Stop`.
3. **Or Docker nginx:** from repo root:
   ```powershell
   .\start-nginx-host-dev.ps1 -BackendPort 8002
   ```
4. In **`frontend`**, use the proxy mode (do **not** set `VITE_API_URL` so the app uses same-origin `/api`):
   ```bash
   npm run dev:behind-proxy
   ```
5. Open **http://127.0.0.1/** (or **http://localhost/**).

**Same PC + LAN (`http://<your-ip>/`):**

nginx listens on **0.0.0.0:80**. After backend + `dev:behind-proxy` + nginx are running, use your LAN IP.

- **Windows Firewall:** if the LAN URL does not load, allow inbound **TCP 80** (PowerShell **as Administrator**):

  ```powershell
  New-NetFirewallRule -DisplayName "nginx dev HTTP 80" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
  ```

- `dev:behind-proxy` can open your LAN URL automatically (see `frontend/vite.config.js`).

**Portals without ports in the URL (`/guest`, `/freelancer`, `/employee`):**

With nginx on **:80**, start portal Vite apps in **proxy** mode:

```bash
cd frontend
npm run dev:portals:proxy
```

Then open **`http://<your-ip>/guest`**, **`/freelancer`**, **`/employee`**. You still need **`npm run dev:behind-proxy`** for the main app on `/`.

Without nginx, use **`npm run dev:portals`** and open e.g. **`http://127.0.0.1:3008/guest/`**.

**Expected Output (direct `npm run dev`):**
```
  VITE v5.x  ready in …

  ➜  Local:   http://127.0.0.1:3005/
```

**✅ Frontend is running when you see:**
- Local URL as above (or clean URL via nginx)
- No error messages
- Browser opens automatically (if configured)

**Note:** Vite is fixed to port **3005** (`strictPort`). If 3005 is busy, free that port or stop the other process.

---

## 🎯 Running Both Services

### Option 1: Two Separate Terminals (Recommended)

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate  # Windows (or source venv/bin/activate on Linux/Mac)
python -m src.main
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Option 2: Using PowerShell Scripts (Windows)

**Start Backend:**
```powershell
.\start-backend.ps1
```

**Start Frontend:**
```powershell
.\start-frontend.ps1
```

---

## ✅ Verification Checklist

### Backend Verification
- [ ] Backend server starts without errors
- [ ] Can access http://localhost:8000/health
- [ ] Can access http://localhost:8000/docs (API documentation)
- [ ] PostgreSQL connection successful
- [ ] No import errors in console

### Frontend Verification
- [ ] Frontend server starts without errors
- [ ] Can access http://localhost:3000 (or 3001)
- [ ] No console errors in browser
- [ ] Can see login page

### Integration Verification
- [ ] Frontend can connect to backend (check browser console)
- [ ] Login/Register works
- [ ] No CORS errors in browser console
- [ ] API requests succeed (check Network tab)

---

## 🔍 Troubleshooting

### Backend Issues

**Problem: PostgreSQL connection failed**
```
Solution:
1. Check PostgreSQL is running: psql -U postgres
2. Verify credentials in .env file
3. Check POSTGRES_HOST and POSTGRES_PORT
```

**Problem: Module not found errors**
```
Solution:
1. Ensure virtual environment is activated
2. Reinstall dependencies: pip install -r requirements.txt
3. Check you're in backend/ directory
```

**Problem: Port 8000 already in use**
```
Solution:
1. Change PORT in .env file to another port (e.g., 8001)
2. Update frontend API_BASE_URL to match
3. Or stop the process using port 8000
```

### Frontend Issues

**Problem: Cannot connect to backend**
```
Solution:
1. Verify backend is running on http://localhost:8000
2. Check CORS_ORIGINS in backend/.env includes frontend port
3. Check browser console for specific error
4. Verify API_BASE_URL in frontend/src/config/api.js
```

**Problem: Port 3000 already in use**
```
Solution:
1. Vite will automatically use 3001
2. Update backend CORS_ORIGINS to include both ports
3. Or stop the process using port 3000
```

**Problem: npm install fails**
```
Solution:
1. Clear npm cache: npm cache clean --force
2. Delete node_modules and package-lock.json
3. Run npm install again
```

### CORS Issues

**Error: "Access to fetch blocked by CORS policy"**
```
Solution:
1. Check backend/.env has correct CORS_ORIGINS
2. Format: CORS_ORIGINS=http://localhost:3000,http://localhost:3001
3. Restart backend after changing .env
```

---

## 📝 Quick Start Commands

### Backend
```bash
cd backend
venv\Scripts\activate  # Windows
python -m src.main
```

### Frontend
```bash
cd frontend
npm run dev
```

### Check Health
```bash
# Backend
curl http://localhost:8000/health

# Frontend
# Open http://localhost:3000 in browser
```

---

## 🌐 Access Points

Once both services are running:

- **Frontend:** http://localhost:3000 (or 3001)
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

---

## 🛑 Stopping Services

**Backend:**
- Press `Ctrl+C` in the terminal running backend

**Frontend:**
- Press `Ctrl+C` in the terminal running frontend

---

## 📚 Additional Resources

- Backend README: `backend/README.md`
- Frontend README: `frontend/README.md`
- API Documentation: http://localhost:8000/docs (when backend is running)
- JD Tables Schema: `backend/JD_TABLES_SCHEMA.md`

---

## 💡 Tips

1. **Always activate virtual environment** before running backend
2. **Check both terminals** for error messages
3. **Use browser DevTools** (F12) to debug frontend issues
4. **Check backend logs** for API errors
5. **Keep .env files secure** - never commit them to git

---

**Need Help?** Check the troubleshooting section or review the error messages in your terminal/browser console.

