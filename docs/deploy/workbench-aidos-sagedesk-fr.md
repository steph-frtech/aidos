# Deploy — AIDOS Workbench at `https://aidos.sagedesk.fr`

How the Workbench (Next.js front, `front/web`) is exposed publicly. The Traefik
pieces live **outside this repo** (`/data/dockers/deployments/traefik/`) on the host,
so they are recorded here for reproducibility.

## Topology

```
browser ──HTTPS──▶ Traefik (:443, LE cert)  ──▶ host.docker.internal:3000 ──▶ next start
                   (dynamic file provider)                                   (front/web)
                                                                                  │
                                                          .env.local DSN ─────────┘
                                                                                  ▼
                                          127.0.0.1:5433 (socat: aidos-pg-proxy) ─▶ supabase-db:5432  db=aidos
```

- **DNS**: `*.sagedesk.fr` is a wildcard → `163.172.52.170` (this host), so `aidos.sagedesk.fr` resolves with no extra record.
- **TLS**: Let's Encrypt via Traefik's `le` resolver (httpChallenge on `:80`).
- The front reads the live `archive` schema per request (`/store` is `force-dynamic`); it falls back to a demo fixture if the DB is unreachable.

## 1. Traefik route (host: `/data/dockers/deployments/traefik/`)

Modeled on the existing `cockpit_redirect.yaml` (host process behind Traefik).

`dynamic/aidos_redirect.yaml` (file provider, hot-reloaded via `watch=true`):

```yaml
http:
  routers:
    aidos-https:
      rule: 'Host(`{{ env "AIDOS_SUBDOMAIN" }}.{{ env "DOMAIN" }}`)'
      entryPoints: [websecure]
      tls:
        certResolver: {{ env "CERT_RESOLVER_NAME" }}
      service: aidos-service
    aidos-http:
      rule: 'Host(`{{ env "AIDOS_SUBDOMAIN" }}.{{ env "DOMAIN" }}`)'
      entryPoints: [web]
      middlewares: [aidos-redirect-to-https]
      service: noop@internal
  middlewares:
    aidos-redirect-to-https:
      redirectScheme: { scheme: https, permanent: true }
  services:
    aidos-service:
      loadBalancer:
        servers:
          - url: 'http://host.docker.internal:{{ env "AIDOS_PORT" }}'
```

`.env` additions (read into the container; templating above needs them present):

```
AIDOS_SUBDOMAIN=aidos
AIDOS_PORT=3000
```

Apply (env_file change requires a container recreate — the dynamic YAML alone is hot-reloaded):

```bash
cd /data/dockers/deployments/traefik && docker compose up -d
```

## 2. The server on :3000

Production build + serve (not the dev server — `next dev` is noisy and not meant for a public URL):

```bash
cd /data/dev/aidos && npm run build -w @aidos/web
cd front/web && npm run start            # next start, :3000, loads .env.local
```

### Reboot-persistent (systemd) — install with sudo

`front/web/.env.local` holds `POSTGRES_CONNECTION_STRING` (gitignored). Unit:

```ini
# /etc/systemd/system/aidos-web.service
[Unit]
Description=AIDOS Workbench (Next.js) on :3000
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=stevig
WorkingDirectory=/data/dev/aidos/front/web
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now aidos-web
```

Until that unit is installed the server runs as a detached process
(`setsid nohup npm run start`) — it survives the shell/session but **not a reboot**.

## 3. DB proxy (already deployed)

`aidos-pg-proxy` (socat) bridges `127.0.0.1:5433` → `supabase-db:5432`, database `aidos`
(isolated from the shared `postgres` DB). The S01 `archive` baseline migration is applied there.

## Verify

```bash
curl -sI http://aidos.sagedesk.fr/store        # 301 → https
curl -s  -o /dev/null -w '%{http_code}\n' https://aidos.sagedesk.fr/store   # 200
```
