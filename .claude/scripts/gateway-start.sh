#!/usr/bin/env bash
# ADR 0074 — lance la passerelle MCP-over-HTTP (back/mcp/gateway) en HTTP, à côté de
# `next start`, de façon DURABLE (setsid nohup → survit à la session, comme le next start
# de prod ; pas de systemd faute de sudo passwordless — cf. docs/deploy/).
#
# La passerelle est l'unique porte HTTP front↔Go (ADR 0074). Stateless : le front fait
# des tools/call one-shot (lib/gateway-sdk.ts). Le mur est appliqué côté serveur.
#
# Idempotent : tue l'ancienne instance, rebuild, relance, healthcheck. ADDR paramétrable.
set -uo pipefail

REPO="${AIDOS_REPO:-/data/dev/aidos}"
ADDR="${AIDOS_GATEWAY_HTTP_ADDR:-:8787}"
BIN="$REPO/.deploy-pulumi/aidos-gateway"
LOG="${AIDOS_GATEWAY_LOG:-/tmp/aidos-gateway.log}"
PORT="${ADDR#:}"

echo "▶ build gateway → $BIN"
(cd "$REPO/back" && go build -o "$BIN" ./mcp/gateway) || { echo "✗ build failed"; exit 1; }

echo "▶ stop any running gateway"
pkill -f 'aidos-gateway' 2>/dev/null || true
sleep 1

echo "▶ launch (setsid nohup, detached) on $ADDR"
setsid nohup env AIDOS_GATEWAY_HTTP_ADDR="$ADDR" "$BIN" >"$LOG" 2>&1 < /dev/null &
disown 2>/dev/null || true
sleep 2

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
	echo "✓ gateway UP on $ADDR"
	# healthcheck: one-shot stateless tools/call gateway_servers must return the fleet.
	N=$(curl -s -X POST "http://127.0.0.1:$PORT" \
		-H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gateway_servers","arguments":{}}}' \
		| grep -o '"servers"' | head -1)
	[ -n "$N" ] && echo "✓ healthcheck: gateway_servers responds" || { echo "✗ healthcheck failed"; cat "$LOG"; exit 1; }
else
	echo "✗ gateway NOT UP — log:"; cat "$LOG"; exit 1
fi
