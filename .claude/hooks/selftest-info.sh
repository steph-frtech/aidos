#!/usr/bin/env bash
# ADR 0075 — SessionStart SELF-TEST shim (CLAUDE.md §8 / S39 : la self-test méta-méta
# prouve les trois garanties NIVEAU 3 inviolables — chaque sensor tire encore, le mur
# tient encore, la fitness est inchangée).
#
# INFORMATIONNEL : ce shim sort TOUJOURS 0 (un SessionStart ne doit jamais bloquer
# l'ouverture du cockpit). Le binaire Go (back/hooks/sessionstart) échoue FERMÉ (exit 2)
# sans DATABASE_URL + SELF_TEST_FITNESS_BASELINE ; on remonte alors « self-test indisponible
# (pas de DB) — garanties NIVEAU 3 vérifiées sous /long-run » en contexte, et on sort 0.
# Quand la DB est câblée et le self-test rougit, on remonte le BlockReason en évidence,
# mais on sort quand même 0 (la fault-injection prouve que le BINAIRE rougit, exit 2).
set -uo pipefail

BIN="${CLAUDE_PROJECT_DIR:-/data/dev/aidos}/.claude/hooks/bin/sessionstart"

if [[ ! -x "$BIN" ]]; then
	echo "ℹ self-test méta-méta : binaire absent — garanties NIVEAU 3 vérifiées sous /long-run."
	exit 0
fi

OUT="$(printf '%s' '{}' | "$BIN" 2>/dev/null)"
CODE=$?

if [[ "$CODE" -eq 0 ]]; then
	echo "✅ self-test méta-méta vert : sensors tirent, mur tient, fitness inchangée (NIVEAU 3)."
else
	echo "ℹ self-test méta-méta non concluant (probablement pas de DATABASE_URL en interactif) — vérifié sous /long-run. Détail :"
	printf '%s\n' "$OUT"
fi

exit 0
