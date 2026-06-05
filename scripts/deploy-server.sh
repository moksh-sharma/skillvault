#!/usr/bin/env bash
# Deploy SkillVault on a shared server without taking ports 80/443.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILES=(
  -f docker-compose.yml
  -f docker-compose.prod.yml
  -f docker-compose.server.yml
)

echo "==> SkillVault deploy (project: skillvault, HTTP port: ${SKILLVAULT_HTTP_PORT:-8080})"
echo "    Root: $ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin is required." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.server.example ]]; then
    echo "==> Creating .env from .env.server.example - edit secrets before production use."
    cp .env.server.example .env
  else
    echo "ERROR: No .env file. Copy .env.server.example to .env and set passwords." >&2
    exit 1
  fi
fi

# Warn if default placeholders remain
if grep -q 'CHANGE_ME' .env 2>/dev/null; then
  echo "WARNING: .env still contains CHANGE_ME placeholders. Update POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET_KEY." >&2
fi

# Check common port conflicts on host (informational)
HTTP_PORT="${SKILLVAULT_HTTP_PORT:-8080}"
if command -v ss >/dev/null 2>&1; then
  if ss -tln | grep -q ":${HTTP_PORT} "; then
    echo "WARNING: something may already be listening on TCP ${HTTP_PORT}." >&2
  fi
fi

echo "==> Building and starting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d --build

echo "==> Waiting for backend health..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${HTTP_PORT}/health" >/dev/null 2>&1; then
    echo "==> Health check OK"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "NOTE: health endpoint not ready yet; check: docker compose ${COMPOSE_FILES[*]} logs backend nginx"
  fi
  sleep 2
done

docker compose "${COMPOSE_FILES[@]}" ps

echo ""
echo "Done. Open: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'SERVER_IP'):${HTTP_PORT}/"
echo "Logs:  docker compose ${COMPOSE_FILES[*]} logs -f"
echo "Stop:  docker compose ${COMPOSE_FILES[*]} down"
