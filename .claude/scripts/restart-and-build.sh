#!/usr/bin/env bash
# restart-and-build.sh — Restart Claude Code fresh and resume the AIDOS build.
#
# WHY a fresh start: newly-created agents / skills / MCP servers only enter the
# registry at Claude Code STARTUP. The dedicated per-step agents (step-s00…step-s47),
# the ui-completeness skill, and the linear/mintlify MCPs were created mid-session, so
# they are NOT dispatchable until a restart. A fresh `claude` process loads them — then
# the build dispatches each step to its dedicated agent (instead of the step-executor
# fallback).
#
# WHAT it does: launches a fresh Claude session in the project that runs the long-run
# workflow NON-STOP from S02 to S47 — each step via its dedicated step-sNN agent,
# validated by step-verifier, never halting on a failed step (failures are accumulated
# and reported at the end).
#
# HOW to use: run it from a PLAIN TERMINAL (not inside a Claude session). If you are
# currently in Claude Code, type /exit first, then:
#     bash /data/dev/aidos/.claude/scripts/restart-and-build.sh
#
set -uo pipefail

PROJECT="/data/dev/aidos"
cd "$PROJECT" || { echo "✗ $PROJECT introuvable"; exit 1; }

# Refuse to nest inside an existing Claude session (the agents would not reload).
if [ -n "${CLAUDECODE:-}${CLAUDE_CODE:-}${CLAUDE_PROJECT_DIR:-}" ]; then
  echo "⚠ Tu sembles déjà dans une session Claude Code."
  echo "  Quitte d'abord (/exit), puis relance ce script depuis un terminal normal."
  exit 1
fi

command -v claude >/dev/null 2>&1 || { echo "✗ 'claude' introuvable dans le PATH"; exit 1; }

# The build instruction. JSON args are passed verbatim to the Workflow tool.
# (No apostrophes — keeps the single shell string simple.)
PROMPT="Tu es en ULTRACODE (effort xhigh + orchestration par workflows, exhaustivite avant vitesse). Lance le workflow long-run avec args {\"startFrom\":\"S02\",\"nonStop\":true} : construis AIDOS de S02 jusqu a S47, NON-STOP. Chaque etape passe par son agent dedie step-sNN (validee par step-verifier) et suit CLAUDE.md section 6 — miroir BDD rouge puis vert, code, ses deux pages Mintlify, son issue Linear (In Progress vers Done), une UI actionnable + theme + bilingue + tutoriel/exemple (ui-completeness), dans le respect du mur. N arrete pas sur un echec : accumule-les et continue jusqu a S47. A la fin, donne la liste des etapes vertes et des echecs."

echo "▶ Nouvelle session Claude (ultracode/xhigh) pour le build AIDOS (long-run S02→S47, non-stop, agents dédiés)…"
# Force ULTRACODE at startup. `--effort` only accepts low|medium|high|xhigh|max, and
# ultracode = **xhigh + dynamic workflow orchestration**, so we pass --effort xhigh; the
# orchestration half is guaranteed because the prompt explicitly launches the long-run
# workflow. (There is no `--effort ultracode`; that name only exists for the interactive
# /effort command.)
# Fresh interactive session keeps the long (multi-hour) background workflow alive and
# re-invokes the loop on each notification. Permissions: the project's
# .claude/settings.local.json runs in bypassPermissions, so the build is unattended.
exec claude --effort xhigh "$PROMPT"
