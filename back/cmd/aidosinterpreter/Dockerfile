# Dockerfile — le SIDECAR INTERPRÉTEUR Go (aidosinterpreter), à côté du serveur Hono émis.
#
# Multi-stage : build statique CGO_DISABLED → image distroless minimale. L'image n'embarque AUCUN
# secret et AUCUNE vérité Kernel — c'est un service runtime below-the-line (le mur §2). Il écoute
# sur $PORT (défaut 8080) et lit $DATABASE_URL (le DSN de l'app ÉMISE ; absent → mode démo).
#
# Build context = back/ (le module Go). Exemple :
#   docker build -f cmd/aidosinterpreter/Dockerfile -t aidos-interpreter:latest .
#   docker run -p 8080:8080 -e DATABASE_URL='postgres://app:app@host:5432/appdb?sslmode=disable' aidos-interpreter:latest

# ── build ────────────────────────────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS build
WORKDIR /src

# Cache des deps : copier go.mod/go.sum d'abord.
COPY go.mod go.sum ./
RUN go mod download

# Le source du module.
COPY . .

# Binaire statique, déterministe (trimpath, pas de chemins absolus, pas de CGO).
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go build -trimpath -ldflags='-s -w' -o /out/aidosinterpreter ./cmd/aidosinterpreter

# ── runtime ──────────────────────────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/aidosinterpreter /aidosinterpreter
EXPOSE 8080
# Le healthcheck du sidecar est GET /healthz (l'orchestrateur le sonde).
ENTRYPOINT ["/aidosinterpreter"]
