# Deploy SkillVault on a shared server (172.16.200.30)

Use this guide when **another application already runs** on the same machine (for example Email Intelligence) and you must **not** take over ports **80** or **443**.

SkillVault runs as an isolated Docker Compose project named **`skillvault`** with its own PostgreSQL and Redis volumes. The public entry point is **port 8080** (HTTPS **8443**), not 80/443.

---

## Architecture

```text
[Users] --> http://172.16.200.30:8080 --> [skillvault-nginx] --> frontend + backend (internal)
                                              |
                                              +--> postgres, redis, celery (internal only)
[Other app] --> still on :80 / :443 (unchanged)
[Ollama]    --> :11434 (shared HTTP; both apps may call it)
```

---

## Prerequisites (on the server)

- Docker Engine + Docker Compose v2
- Git (or copy the `bank.ai` folder to the server)
- Enough disk/RAM for Postgres + Celery + builds
- **Do not** stop or reconfigure the other app’s nginx/IIS unless you add an optional proxy snippet (see below)

---

## 1. Pre-flight - check ports

**Linux:**

```bash
sudo ss -tlnp | grep -E ':80|:443|:8080|:8443|:5432|:6379'
docker ps
```

**Windows Server:**

```powershell
netstat -ano | findstr ":80 :443 :8080 :8443"
```

Confirm **80/443** belong to the existing tool. SkillVault will use **8080** (changeable via `SKILLVAULT_HTTP_PORT` in `.env`).

---

## 2. Install the app on the server

```bash
sudo mkdir -p /opt/skillvault
sudo chown "$USER:$USER" /opt/skillvault
cd /opt/skillvault
git clone <your-repo-url> .
cd bank.ai
```

Or upload/copy only the `bank.ai` directory.

---

## 3. Configure environment

```bash
cp .env.server.example .env
nano .env   # or vim
```

**Required changes:**

| Variable | Action |
|----------|--------|
| `POSTGRES_PASSWORD` | Strong unique password |
| `REDIS_PASSWORD` | Strong unique password |
| `JWT_SECRET_KEY` | Long random string |
| `FRONTEND_BASE_URL` | `http://172.16.200.30:8080` (or your hostname) |
| `CORS_ORIGINS` | Same origin(s) users use in the browser |

`OLLAMA_BASE_URL` can stay `http://172.16.200.30:11434` if Ollama runs on that host.

If **8080** is busy, set:

```env
SKILLVAULT_HTTP_PORT=8081
SKILLVAULT_HTTPS_PORT=8444
FRONTEND_BASE_URL=http://172.16.200.30:8081
```

---

## 4. Deploy

```bash
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

Manual equivalent:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d --build
```

---

## 5. Verify

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/api/health
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml ps
```

From your PC: open **http://172.16.200.30:8080/**

Confirm the **other app** still loads on its usual URL (e.g. `http://172.16.200.30/`).

---

## 6. Firewall

Open only SkillVault’s port (example UFW):

```bash
sudo ufw allow 8080/tcp comment 'SkillVault HTTP'
```

Do not remove rules for the existing application.

---

## 7. Optional - host nginx subdomain (keep :80 for other app)

If the host already has nginx on **80**, add a **new** `server` block only (see `nginx/nginx.host-proxy.example.conf`), proxying to `127.0.0.1:8080`:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Users then open `http://skillvault.yourcompany.local/` while the other tool keeps its hostname/path.

---

## Operations

| Task | Command |
|------|---------|
| Logs | `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml logs -f` |
| Restart | `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml restart` |
| Stop (does not affect other Docker projects) | `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml down` |
| Update | `git pull && ./scripts/deploy-server.sh` |

**Backups:** `postgres_data` and `backend_uploads` volumes - see [production.md](./production.md).

---

## What stays isolated

- Compose project name: **`skillvault`** (container/volume prefix)
- No publish of Postgres **5432** or Redis **6379** to the host (default compose)
- No binding to host **80/443** when using `docker-compose.server.yml`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `port is already allocated` on 8080 | Set `SKILLVAULT_HTTP_PORT` in `.env` and redeploy |
| Other app broke after deploy | You likely bound 80:80 - use only `docker-compose.server.yml`, not plain `docker compose up` |
| CORS errors | Set `CORS_ORIGINS` to the exact browser URL (including port) |
| Celery/Outlook sync idle | `docker compose ... logs celery`; check Redis password in `.env` |
| Ollama timeouts | Shared load on `11434`; reduce parallel jobs or scale Ollama |

---

## Related

- [production.md](./production.md) - secrets, HTTPS certs, backups
- [HOW_TO_RUN.md](../HOW_TO_RUN.md) - local development
