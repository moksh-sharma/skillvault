# Troubleshooting

## 404 (Not Found) - "Failed to load resource"

- **Meaning:** The browser requested a URL and the server said the resource does not exist.
- **What to do:**
  1. Open DevTools → **Network** tab and find the red/failed request.
  2. Check the **Request URL** that returned 404.
  - If it’s an **API** URL (e.g. `/api/...`): ensure the backend is running and that you’re using the correct base URL (see frontend `.env` / `VITE_API_URL`).
  - If it’s a **static file** (e.g. favicon, chunk, image): you can ignore it or add the missing file; it usually doesn’t break login.

## 401 (Unauthorized) on `/api/auth/login`

- **Meaning:** The login request reached the server but the credentials were rejected.
- **Backend behavior:** The API returns 401 when:
  - **Invalid email** - no user in the database with that email.
  - **Invalid password** - user exists but the password is wrong.
- **If the `users` table is empty:** Every login will return 401 until you create at least one user.

**Fix - create a user:**

1. **Sign up in the app**  
   Use the normal **Sign Up** flow in the UI and then log in with that email and password.

2. **Or create a default admin (backend script)**  
   From the project root (with backend env and DB available):
   ```powershell
   cd backend
   $env:DEFAULT_ADMIN_EMAIL='your@email.com'
   $env:DEFAULT_ADMIN_PASSWORD='YourSecurePassword'
   python -m scripts.seed_default_admin
   ```
   Then log in with that email and password.

## API base URL (frontend)

- **Docker (app at http://localhost):** The frontend is built with `VITE_API_URL=/api`, so requests go to `http://localhost/api/...` and Nginx proxies to the backend. No extra config needed.
- **Local dev (frontend on port 5173, backend on port 8000):** If you don’t set `VITE_API_URL`, the frontend uses `http://<hostname>:8000/api`. Ensure the backend is running on port 8000 (or set `VITE_API_URL` in `frontend/.env` to match your backend, e.g. `http://localhost:8000/api`).
