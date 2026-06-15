#!/usr/bin/env bash
# ADR 0075 — PostToolUse SENSOR-RUNNER shim (CLAUDE.md §6 étape 4 : auto-certification
# computationnelle à chaque diff).
#
# Le binaire Go (back/hooks/posttooluse) exécute les sensors gelés (gofmt / vet / go build
# / go test / archtest) sur les paquets affectés par le diff. ADVISORY : ce shim sort
# TOUJOURS 0 — un sensor rouge est REMONTÉ (stderr) mais ne bloque pas le tour interactif ;
# le blocage par diff est la responsabilité de /long-run (qui gate l'avancement de step).
#
# PÉRIMÈTRE PERF (résout l'OpenQuestion « par diff vs en lot » de l'ADR 0075) : les sensors
# lourds (go build / go test, plafond 60s/outil) ne tournent QUE si armés
# (AIDOS_HOOK_SENSORS=1) — typiquement sous /long-run. En interactif (non armé) le shim
# remonte un rappel et sort 0 sans lancer la suite lourde, pour ne pas ralentir le cockpit.
# Le e2e-changed-spec.sh existant reste câblé À CÔTÉ (ADD-only, §5).
set -uo pipefail

BIN="${CLAUDE_PROJECT_DIR:-/data/dev/aidos}/.claude/hooks/bin/posttooluse"
INPUT="$(cat)"

# Non armé → ne lance pas la suite lourde (perf cockpit). Le hook est câblé et tire ;
# la suite complète tourne par diff sous /long-run (AIDOS_HOOK_SENSORS=1) ou en lot.
if [[ "${AIDOS_HOOK_SENSORS:-0}" != "1" ]]; then
	exit 0
fi

if [[ ! -x "$BIN" ]]; then
	echo "⚠ sensors hook: binaire absent ($BIN) — fail open (advisory)." >&2
	exit 0
fi

OUT="$(printf '%s' "$INPUT" | "$BIN" 2>/dev/null)"
CODE=$?

if [[ "$CODE" -ne 0 ]]; then
	echo "🔴 sensor rouge sur ce diff (computationnel) — advisory, voir le détail :" >&2
	printf '%s\n' "$OUT" >&2
fi

# Advisory : toujours allow (le gate dur est dans /long-run).
exit 0
