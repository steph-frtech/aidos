#!/usr/bin/env bash
# ADR 0075 — Stop DONE-CRITERION shim (CLAUDE.md §8, anti-Goodhart).
#
# Le « done » est CALCULÉ, jamais déclaré par l'agent. Ce shim passe l'événement Stop
# au binaire Go (back/hooks/stop) qui calcule : red set → green ∧ green antérieur intact
# ∧ mutation ≥ seuil ∧ pas de monstre (goal-check S29 + completeness S12).
#
# AUTO-GATÉ par construction : sans DATABASE_URL le binaire utilise NoGoalSource +
# EmptyCutSource → exit 0 (allow). Il ne BLOQUE que sous /long-run avec un goal ouvert
# encore rouge. En interactif (aucun goal ouvert) il laisse toujours passer — le cockpit
# n'est pas brické. Sous /long-run, bloquer une clôture prématurée est l'EFFET RECHERCHÉ.
#
# Garde anti-boucle : si stop_hook_active==true (Claude Code relance déjà après un bloc),
# on laisse passer (fail open) pour ne jamais boucler à l'infini. Fail-open aussi si le
# binaire est absent. Le scan audit.sh (agentshield) reste câblé À CÔTÉ (ADD-only, §5).
set -uo pipefail

BIN="${CLAUDE_PROJECT_DIR:-/data/dev/aidos}/.claude/hooks/bin/stop"
INPUT="$(cat)"

# Garde anti-boucle : déjà en continuation après un bloc → fail open.
if printf '%s' "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
	exit 0
fi

# Garde d'infra : binaire absent → fail open (le done-criterion est porté par /long-run).
if [[ ! -x "$BIN" ]]; then
	exit 0
fi

OUT="$(printf '%s' "$INPUT" | "$BIN" 2>/dev/null)"
CODE=$?

if [[ "$CODE" -eq 2 ]]; then
	echo "⛔ STOP refusé : « done » non atteint (goal rouge / green cassé / mutation sous le seuil / monstre — §8)." >&2
	printf '%s\n' "$OUT" >&2
	echo "→ aidos explain  pour le détail actionnable." >&2
	exit 2
fi

exit 0
