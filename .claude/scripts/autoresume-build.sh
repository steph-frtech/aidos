#!/usr/bin/env bash
# AIDOS auto-resume safety net.
# Run by cron every ~15 min. If a track's build is NOT progressing (session died /
# usage-limit window passed) and steps remain, it (re)starts a DETACHED tmux session
# running a fresh `claude` that relaunches the auto-resume orchestrator from the last
# validated step. Idempotent, guarded (flock + tmux-session + recent-workflow-activity),
# self-removing when the track is done. Best-effort; logs everything.
#
# Stop it:  crontab -e  (remove the autoresume line)   OR   tmux kill-session -t aidos-build
# Watch it: tail -f /tmp/aidos-autoresume.log
set -uo pipefail

REPO=/data/dev/aidos
DOCS="$REPO/.aidos-docs"
CLAUDE=/home/stevig/.local/bin/claude
LOG=/tmp/aidos-autoresume.log
LOCK=/tmp/aidos-autoresume.lock
STATE=/tmp/aidos-autoresume.state          # holds the active track: "EL EL_PLAN.md 19"
STALE_MIN=12                                # build considered dead if no workflow file touched in this window
MAX_PER_DAY=20                              # circuit-breaker against a runaway permanently-broken build

log(){ echo "$(date '+%F %T') $*" >>"$LOG"; }

# 0. single-instance (held for the whole run; overlapping cron fires skip instantly)
exec 9>"$LOCK"; flock -n 9 || exit 0

# 1. which track? STATE: "TRACK PLAN LAST [NEXTPREFIX NEXTLAST]" (2nd phase optional).
TRACK=EL; PLAN=EL_PLAN.md; LAST=19; NEXTPREFIX=""; NEXTLAST=""
if [ -f "$STATE" ]; then read -r TRACK PLAN LAST NEXTPREFIX NEXTLAST < "$STATE" 2>/dev/null || true; fi

# highest step NN whose concept doc FILE exists, or -1.
# Filesystem-based (steps/concept/<prefix>NN-*.mdx), NOT git-log: a commit MESSAGE
# mentioning e.g. "FK01-16" must never be mistaken for a pushed FK step doc.
last_num(){
  local p="$1" v
  v=$(ls "$DOCS/steps/concept" 2>/dev/null | grep -oiE "^${p}[0-9]+" | sed -E "s/^${p}//I" | sort -n | tail -1)
  if [[ "$v" =~ ^[0-9]+$ ]]; then echo $((10#$v)); else echo -1; fi
}

# 2. phase selection (S→FK) + cursor = last validated step + 1
s_last=$(last_num "$TRACK")
phase_prefix="$TRACK"; phase_last="$LAST"; phase_done=$s_last
if [ -n "$NEXTPREFIX" ]; then
  nx_last=$(last_num "$NEXTPREFIX")
  if [ "$nx_last" -ge 0 ] || [ "$s_last" -ge "$LAST" ]; then
    phase_prefix="$NEXTPREFIX"; phase_last="$NEXTLAST"; phase_done=$nx_last   # in 2nd phase
  fi
fi
next_n=$((phase_done + 1)); [ "$next_n" -lt 1 ] && next_n=1
if [ "$next_n" -gt "$phase_last" ]; then
  log "[$phase_prefix] all steps done → removing autoresume cron"
  crontab -l 2>/dev/null | grep -v 'autoresume-build.sh' | crontab - 2>/dev/null || true
  exit 0
fi
TRACK="$phase_prefix"; LAST="$phase_last"
CURSOR=$(printf '%s%02d' "$phase_prefix" "$next_n")

# 3. is a build already progressing?  (any workflow file touched recently)
if find "$HOME/.claude/projects" -path '*subagents/workflows/*' -type f -mmin -"$STALE_MIN" 2>/dev/null | grep -q .; then
  log "[$TRACK] build active (workflow touched < ${STALE_MIN}m) → skip"; exit 0
fi
# already a resume tmux running?
if tmux has-session -t aidos-build 2>/dev/null; then
  log "[$TRACK] tmux aidos-build already running → skip"; exit 0
fi

# 4. circuit-breaker: too many relaunches today?
today=$(date '+%F'); n_today=$(grep -c "^$today.*RELAUNCH" "$LOG" 2>/dev/null || echo 0)
if [ "$n_today" -ge "$MAX_PER_DAY" ]; then
  log "[$TRACK] MAX_PER_DAY ($MAX_PER_DAY) reached → skip (manual check needed)"; exit 0
fi

# 5. ensure the dev server is up (per-step e2e need it)
if ! curl -sf -m4 -o /dev/null http://localhost:3000 2>/dev/null; then
  log "[$TRACK] dev :3000 down → starting next dev"
  (cd "$REPO/front/web" && nohup npm run dev >/tmp/aidos-next-dev.log 2>&1 &) ; sleep 8
fi

# 6. relaunch in a detached tmux running a fresh claude (stays alive to drive the bg workflow)
# Model PINNED to Fable 5 (deterministic, independent of the user's saved default).
# ULTRACODE headless = THREE things together (the CLI rejects 'ultracode' as an
# --effort value): (1) the lowercase keyword "ultracode" in the prompt — the harness
# detects it and arms multi-agent workflow orchestration for the session; (2)
# --effort xhigh (the max headless effort knob, also the settings.json effortLevel
# default); (3) the workflow-orchestration instructions in the prompt.
MODEL="${AIDOS_BUILD_MODEL:-claude-opus-4-8}"
# ADR 0091 — l'agent-CONSTRUCTEUR d'AIDOS bâtit le substrat (migrations/kernel) ; wall.sh
# audite mais ne le bloque jamais en mode build (la garantie produit reste côté serveur).
export AIDOS_BUILD_MODE="${AIDOS_BUILD_MODE:-1}"
PROMPT="ultracode — Tu es en ULTRACODE (mot-clé actif : orchestration par workflows multi-agents + effort xhigh). REPRENDS le build AIDOS de la piste DP dans /data/dev/aidos depuis l'étape ${CURSOR}. Le plan est docs/plan/ROADMAP-provisioning-deploy.md (DP01→DP33) ; la spec canonique est docs/plan/SPEC-stack-2026.md. Exigences absolues maintenues : chaque déploiement dev = une VRAIE app visible (conteneur + route Traefik <projet>-dev.sagedesk.fr) ; la PORTE DE VALIDATION HUMAINE sur dev (événement validation_humaine + loi au miroir : staging refusé sans validation humaine du dev courant). Méthode KRD : miroir d'abord, déterminisme-first, le mur intact, vitest+e2e existants restent verts. Lance le Workflow long-run-dp (scriptPath .claude/workflows/long-run-dp.js — contrat DP + boucle d'auto-relance INTÉGRÉS au script) avec args {startFrom:'${CURSOR}'} ; il s'auto-relance sur cale infra (plan 5x / même étape 3x) et s'arrête sur vrai échec/BLOCKED. e2e via PLAYWRIGHT_WEB_PORT=3210 (ne touche pas la prod :3000). Commit+push build/s00-s47 régulièrement + 2 pages Mintlify dpNN par étape. À DP33 : le one-shot complet + rebuild prod. Ne fais RIEN d'autre."
log "[$TRACK] RELAUNCH from $CURSOR (phase_done=$phase_done) in tmux aidos-build"
tmux new-session -d -s aidos-build \
  "cd $REPO && $CLAUDE --permission-mode bypassPermissions --model "$MODEL" --effort xhigh \"$PROMPT\" >>/tmp/aidos-autoresume-claude.log 2>&1; echo \"\$(date) claude session ended\" >>$LOG"
exit 0
