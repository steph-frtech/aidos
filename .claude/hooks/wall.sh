#!/usr/bin/env bash
# ADR 0075 — PreToolUse WALL shim (CLAUDE.md §2, défense en profondeur NIVEAU 1).
#
# Le mur du build-agent TIRE ici : ce shim passe l'événement tool-call de Claude Code
# (stdin JSON) au classifieur Go déterministe (back/hooks/pretooluse) et BLOQUE (exit 2)
# toute écriture au-dessus de la ligne de flottaison — schémas kernel/mirrors/fitness,
# back/kernel/**, back/migrations/**. Le binaire Go est l'AUTORITÉ (determinism-first,
# §8) ; le shim ne fait que NORMALISER le chemin puis l'appeler et propager sa décision.
#
# NORMALISATION (couche adapter) : Claude Code envoie un file_path ABSOLU
# (/data/dev/aidos/back/kernel/x.go) ; le classifieur gouverné attend une cible
# repo-relative (back/kernel/x.go) — son préfixe back/kernel/ ne matche pas un chemin
# absolu. Le shim retire le préfixe CLAUDE_PROJECT_DIR/ AVANT d'appeler le binaire, sans
# toucher au classifieur gouverné ni à ses miroirs de propriété (single-source intact).
#
# FAIL-OPEN sur erreur d'infra (binaire absent, jq absent, exec échoue) : un hook cassé
# ne doit JAMAIS bricker le cockpit — seule une classification « deny » réussie bloque.
# Le NIVEAU 2 (GRANTs Postgres, §2) reste la garde quand le binaire est absent.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/data/dev/aidos}"
BIN="$PROJECT_DIR/.claude/hooks/bin/pretooluse"
INPUT="$(cat)"

# Garde d'infra : binaire ou jq absent → fail open (allow), avertit.
if [[ ! -x "$BIN" ]] || ! command -v jq >/dev/null 2>&1; then
	echo "⚠ wall hook: classifieur ou jq absent — fail open (GRANTs Postgres = NIVEAU 2). Rebuild: (cd back && go build -o ../.claude/hooks/bin/pretooluse ./hooks/pretooluse)" >&2
	exit 0
fi

# Extrait la cible (file_path Claude Code, ou path/schema à plat) et la rend repo-relative.
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .path // empty' 2>/dev/null)"
SCHEMA="$(printf '%s' "$INPUT" | jq -r '.tool_input.schema // .schema // empty' 2>/dev/null)"
REL="${FILE#"$PROJECT_DIR"/}"   # absolu → repo-relative ; no-op si déjà relatif

# Câblage spike-confinement (S28/ADR 0023) : on PROPAGE les deux champs INJECTÉS par le
# harnais / la MCP idea-intake — idea_status (le statut de l'idée qui pilote l'écriture,
# « spiking » quand un /spike est actif) et gesture (« spike »|« harvest »). Le classifieur
# Go fait tirer la garde spike-confinement AVANT le mur de zone (déterministe, défère au
# cœur pur runtime/exploration). Absents (écriture ordinaire) ⇒ chaîne inchangée (additif).
IDEA_STATUS="$(printf '%s' "$INPUT" | jq -r '.idea_status // .tool_input.idea_status // empty' 2>/dev/null)"
GESTURE="$(printf '%s' "$INPUT" | jq -r '.gesture // .tool_input.gesture // empty' 2>/dev/null)"

# Chemin SPIKE : la zone « /spike » est un préfixe ABSOLU repo-relatif (KRD §84), DISTINCT de
# la normalisation du mur de zone (qui rend « back/kernel/ » repo-relatif SANS slash de tête).
# On garde donc REL puis on RÉ-ÉPINGLE un slash de tête (`/spike/...`) — sans toucher `path`,
# que le mur de zone lit tel quel. Vide si pas de fichier (un harvest pur vise un schema).
SPIKE_PATH=""
if [[ -n "$REL" ]]; then SPIKE_PATH="/${REL#/}"; fi

# Réémet un événement normalisé à plat (schema gagne sur path dans le classifieur ; pour un
# harvest, le schema gardé est la cible de gel kernel/mirrors/fitness ; spike_path porte le
# chemin absolu-repo que la garde de confinement /spike inspecte).
NORM="$(jq -n --arg p "$REL" --arg s "$SCHEMA" --arg is "$IDEA_STATUS" --arg g "$GESTURE" --arg sp "$SPIKE_PATH" \
	'{path:$p, schema:$s, idea_status:$is, gesture:$g, spike_path:$sp}' 2>/dev/null)"

OUT="$(printf '%s' "$NORM" | "$BIN" 2>/dev/null)"
CODE=$?

if [[ "$CODE" -eq 2 ]]; then
	echo "🧱 LE MUR refuse cette écriture (au-dessus de la ligne de flottaison — kernel/mirrors/fitness)." >&2
	printf '%s\n' "$OUT" >&2
	exit 2
fi

# Allow (0) ou tout code inattendu → fail open (allow), ne bricke jamais le cockpit.
exit 0
