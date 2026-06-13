#!/usr/bin/env bash
# restart-and-build.sh — Restart Claude Code and RESUME the current session to drive
# the AIDOS build.
#
# WHY resume (-r) the current session instead of a fresh one:
#   - A fresh `claude` PROCESS reloads the registry → the dedicated step-sNN agents +
#     new skills/MCPs (which only register at startup) become dispatchable.
#   - Resuming the SAME conversation (-r) keeps all the context AND the long-run's
#     resume-from-cache (already-validated steps return instantly).
#
# BEHAVIOUR: the build STOPS on a failed step (no non-stop). After 2 retries, long-run
# hands back with the failing step + residual_issues. Fix it (or just retry), then run
# this script again — it resumes and continues from the step where it stopped.
#
# HOW to use: run it from a PLAIN TERMINAL (not inside a Claude session). If you are
# currently in Claude Code, type /exit first, then:
#     bash /data/dev/aidos/.claude/scripts/restart-and-build.sh
#
set -uo pipefail

PROJECT="/data/dev/aidos"
SESS_DIR="$HOME/.claude/projects/-data-dev-aidos"
cd "$PROJECT" || { echo "✗ $PROJECT introuvable"; exit 1; }

# Refuse to nest inside an existing Claude session (the agents would not reload).
if [ -n "${CLAUDECODE:-}${CLAUDE_CODE:-}${CLAUDE_PROJECT_DIR:-}" ]; then
  echo "⚠ Tu sembles déjà dans une session Claude Code."
  echo "  Quitte d'abord (/exit), puis relance ce script depuis un terminal normal."
  exit 1
fi

command -v claude >/dev/null 2>&1 || { echo "✗ 'claude' introuvable dans le PATH"; exit 1; }

# The session to resume = the most recent AIDOS conversation (la session en cours).
SID="$(ls -t "$SESS_DIR"/*.jsonl 2>/dev/null | head -1 | xargs -r basename | sed 's/\.jsonl$//')"
[ -n "$SID" ] || { echo "✗ Aucune session à reprendre dans $SESS_DIR"; exit 1; }

# Build instruction. NO nonStop: long-run stops on a failed step. The resumed session
# has the context to pick the right startFrom (S02 first, else the stopped step).
PROMPT="ultracode — Tu es en ULTRACODE (mot-clé actif : orchestration par workflows multi-agents + effort xhigh, exhaustivite avant vitesse). Reprends le build AIDOS : relance le workflow long-run SANS nonStop (il DOIT s arreter sur un echec apres les retries), en repartant de la premiere etape non encore validee — startFrom S02 au premier lancement, sinon l etape ou il s etait arrete (vois le dernier STOP dans cette conversation). Chaque etape passe par son agent dedie step-sNN, validee par step-verifier, en suivant CLAUDE.md section 6 : miroir BDD rouge->vert, code, ses deux pages Mintlify, son issue Linear (In Progress->Done), une UI actionnable + theme + bilingue + tutoriel/exemple (ui-completeness), dans le respect du mur. S il s arrete sur une etape, donne-moi l etat exact (etape + residual_issues)."

echo "▶ Reprise (-r) de la session $SID en ultracode/xhigh — build AIDOS (long-run, STOP sur échec, agents dédiés)…"
# --effort only accepts low|medium|high|xhigh|max; ultracode = xhigh + workflow
# orchestration, so --effort xhigh + the workflow-driven prompt = ultracode. --resume
# reuses the fresh process (agents load) while restoring the conversation + cache.
# Model PINNED to Fable 5 (deterministic, independent of the saved default).
exec claude --model "${AIDOS_BUILD_MODEL:-claude-opus-4-8}" --effort xhigh --resume "$SID" "$PROMPT"
