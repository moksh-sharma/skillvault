# TechBank.ai - Production checklist

Use this checklist when deploying the Docker stack to production.

## Secrets and environment

- Set strong **POSTGRES_PASSWORD**, **JWT_SECRET_KEY**, and **REDIS_PASSWORD** in `.env` (no default values).
- Set **FRONTEND_BASE_URL** to your public URL (e.g. `https://yourdomain.com`).
- Never commit `.env`. Prefer Docker secrets or a vault for real deployments.

## HTTPS

- Place TLS certificates in `nginx/ssl/` as `cert.pem` and `key.pem`, or terminate TLS at a reverse proxy (Traefik, cloud load balancer, etc.) in front of nginx.
- For Let’s Encrypt, use certbot or a reverse proxy that handles ACME.

## Running in production mode

- Use the production override so required env vars have no defaults:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  ```
- Ensure `.env` contains all required variables before running.

## Backups

- Back up the **postgres_data** volume regularly (e.g. `pg_dump` from the postgres container).
- Back up the **backend_uploads** volume if it contains important uploaded files.

## Optional hardening

- Use non-default ports for 80/443 if desired (e.g. via a reverse proxy).
- Consider replicas and external health checks (e.g. load balancer health checks).
- Restrict **CORS_ORIGINS** to specific origins if the API is exposed to other domains.
