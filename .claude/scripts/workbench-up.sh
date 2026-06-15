#!/usr/bin/env bash
# ADR 0074 — amène le Workbench AIDOS COMPLET en prod, avec la couture front↔Go LIVE :
# la passerelle MCP-over-HTTP (back/mcp/gateway, :8787) ET le `next start` (:3000) tournent
# tous deux en setsid nohup (durables, survivent à la session ; pas de systemd faute de
# sudo passwordless — cf. docs/deploy/workbench-aidos-sagedesk-fr.md). Idempotent.
#
# Le next start charge front/web/.env.local (AIDOS_GATEWAY_HTTP_URL=http://127.0.0.1:8787)
# → les server actions atteignent la gateway → les panneaux passent en source "live".
# Si la gateway tombe, le front retombe sur un APERÇU DÉCLARÉ (jamais un faux "live",
# ADR 0074 §5) — la dégradation est gouvernée.
#
# Usage (terminal normal OU via l'autoresume) : bash .claude/scripts/workbench-up.sh
set -uo pipefail

REPO="${AIDOS_REPO:-/data/dev/aidos}"
GW_ADDR="${AIDOS_GATEWAY_HTTP_ADDR:-:8787}"
GW_PORT="${GW_ADDR#:}"
GW_BIN="$REPO/.deploy-pulumi/aidos-gateway"
WEB_PORT="${AIDOS_WEB_PORT:-3000}"
GW_LOG="${AIDOS_GATEWAY_LOG:-/tmp/aidos-gateway.log}"
WEB_LOG="${AIDOS_WEB_LOG:-/tmp/aidos-next-start.log}"

wait_port() { # $1=port $2=max_seconds
	for _ in $(seq 1 "${2:-10}"); do ss -ltn 2>/dev/null | grep -q ":$1 " && return 0; sleep 1; done; return 1
}
wait_free() { # $1=port $2=max_seconds — wait for a port to be RELEASED
	for _ in $(seq 1 "${2:-10}"); do ss -ltn 2>/dev/null | grep -q ":$1 " || return 0; sleep 1; done; return 1
}

gw_healthy() {
	curl -s -X POST "http://127.0.0.1:$GW_PORT" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gateway_servers","arguments":{}}}' 2>/dev/null | grep -q '"servers"'
}

# ── 1. Gateway (:8787) — build + durable launch (IDEMPOTENT: skip if already healthy) ──
if ss -ltn 2>/dev/null | grep -q ":$GW_PORT " && gw_healthy; then
	echo "✓ gateway already UP + healthy on $GW_ADDR (skip relaunch)"
else
	echo "▶ gateway: build"
	(cd "$REPO/back" && go build -o "$GW_BIN" ./mcp/gateway) || { echo "✗ gateway build failed"; exit 1; }
	echo "▶ gateway: (re)launch on $GW_ADDR"
	pkill -f 'aidos-gateway' 2>/dev/null || true
	wait_free "$GW_PORT" 15 || echo "  (port $GW_PORT still held; relying on SO_REUSEADDR)"
	setsid nohup env AIDOS_GATEWAY_HTTP_ADDR="$GW_ADDR" "$GW_BIN" >"$GW_LOG" 2>&1 < /dev/null &
	disown 2>/dev/null || true
	# generous wait: the previous listener may linger in the task-runner's reap window.
	if wait_port "$GW_PORT" 30; then echo "✓ gateway UP on $GW_ADDR"; else echo "✗ gateway NOT UP — log:"; cat "$GW_LOG"; exit 1; fi
fi

# ── 2. next start (:3000) — durable restart so it loads AIDOS_GATEWAY_HTTP_URL ─────────
echo "▶ web: stop old next start (:$WEB_PORT)"
pkill -f "next start.*--port $WEB_PORT" 2>/dev/null || pkill -f "next start" 2>/dev/null || true
wait_free "$WEB_PORT" 15 || echo "  (port $WEB_PORT still held)"
echo "▶ web: launch next start (:$WEB_PORT) — loads front/web/.env.local"
( cd "$REPO/front/web" && setsid nohup "$REPO/node_modules/.bin/next" start --port "$WEB_PORT" >"$WEB_LOG" 2>&1 < /dev/null & disown 2>/dev/null || true )
if wait_port "$WEB_PORT" 60; then echo "✓ web UP on :$WEB_PORT"; else echo "✗ web NOT UP — log:"; tail -20 "$WEB_LOG"; exit 1; fi

# ── 2b. telemetry-sink (:4319) + collector → sink (ADR 0076 phase 2) ──────────────────
# Le sink OTLP→Postgres persiste les spans de l'app émise dans telemetry.span (sinon perdus
# sur le `debug` du collector). Durable (setsid nohup), branché sur la base de vérité.
SINK_ADDR="${AIDOS_TELEMETRY_SINK_ADDR:-:4319}"
SINK_PORT="${SINK_ADDR#:}"
SINK_BIN="$REPO/.deploy-pulumi/telemetry-sink"
SINK_DSN="${AIDOS_TELEMETRY_SINK_DSN:-$(grep -oE 'POSTGRES_CONNECTION_STRING=.*' "$REPO/front/web/.env.local" 2>/dev/null | head -1 | cut -d= -f2-)}"
if [ -n "$SINK_DSN" ]; then
	echo "▶ telemetry-sink: build + (re)launch on $SINK_ADDR"
	(cd "$REPO/back" && go build -o "$SINK_BIN" ./cmd/telemetry-sink) || echo "  ✗ sink build failed (skip)"
	pkill -f 'telemetry-sink' 2>/dev/null || true
	wait_free "$SINK_PORT" 8 || true
	if [ -x "$SINK_BIN" ]; then
		setsid nohup env AIDOS_TELEMETRY_SINK_ADDR="$SINK_ADDR" AIDOS_TELEMETRY_SINK_DSN="$SINK_DSN" "$SINK_BIN" >/tmp/telemetry-sink.log 2>&1 < /dev/null &
		disown 2>/dev/null || true
		wait_port "$SINK_PORT" 8 && echo "✓ telemetry-sink UP on $SINK_ADDR" || echo "  ✗ sink NOT UP (collector keeps debug)"
	fi
	# Reconfigure the instance collector to ALSO export traces to the sink (debug kept).
	if docker inspect opentelemetry-collector >/dev/null 2>&1; then
		GW="$(docker inspect opentelemetry-collector --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' 2>/dev/null | head -c 32)"
		[ -z "$GW" ] && GW="172.18.0.1"
		CFG="$REPO/.deploy-pulumi/otel/config.yaml"
		mkdir -p "$(dirname "$CFG")"
		sed "s#__SINK_ENDPOINT__#http://$GW:$SINK_PORT/v1/traces#" "$REPO/.claude/scripts/otel-collector-config.yaml" > "$CFG"
		docker restart opentelemetry-collector >/dev/null 2>&1 && echo "✓ collector reconfiguré → sink ($GW:$SINK_PORT) + debug" || echo "  ✗ collector restart failed"
	fi
else
	echo "▶ telemetry-sink: pas de DSN → ignoré (spans restent sur le debug du collector)"
fi

# ── 3. healthchecks ───────────────────────────────────────────────────────────────────
echo "▶ healthcheck gateway (one-shot stateless gateway_servers):"
curl -s -X POST "http://127.0.0.1:$GW_PORT" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
	-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gateway_servers","arguments":{}}}' | grep -o '"servers"' >/dev/null \
	&& echo "  ✓ gateway responds" || echo "  ✗ gateway healthcheck failed"
echo "▶ healthcheck web (HTTP / and /gateway):"
echo "  / → $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/")"
echo "  /gateway → $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/gateway")"
echo "✓ Workbench up : gateway :$GW_PORT + web :$WEB_PORT (couture front↔Go LIVE)"
