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

# 1. which track? default EL; STATE file lets you point it elsewhere later.
TRACK=EL; PLAN=EL_PLAN.md; LAST=19
if [ -f "$STATE" ]; then read -r TRACK PLAN LAST < "$STATE" 2>/dev/null || true; fi

# 2. cursor = last validated step (docs pushed) + 1
last_done=$(cd "$DOCS" 2>/dev/null && git log --oneline -60 2>/dev/null \
            | grep -oiE "${TRACK}[0-9]+" | tr 'a-z' 'A-Z' | sort -u | tail -1)
last_n=${last_done#"${TRACK}"}
if [[ "$last_n" =~ ^[0-9]+$ ]]; then last_n=$((10#$last_n)); else last_n=-1; fi
next_n=$((last_n + 1))
if [ "$next_n" -gt "$LAST" ]; then
  log "[$TRACK] all steps done (last=$last_done) → removing autoresume cron"
  crontab -l 2>/dev/null | grep -v 'autoresume-build.sh' | crontab - 2>/dev/null || true
  exit 0
fi
CURSOR=$(printf '%s%02d' "$TRACK" "$next_n")

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
PROMPT="Tu es en ULTRACODE (effort xhigh + orchestration par workflows). Reprends le build du track ${TRACK} (compound du besoin) d'AIDOS dans /data/dev/aidos. Lance le Workflow long-run avec planPath='${PLAN}', startFrom='${CURSOR}', enveloppé dans une boucle d'auto-relance : relance sur une cale infra (long-run STOP stoppedAt='plan' jusqu'à 5× consécutifs, OU une même étape qui cale jusqu'à 3×), s'arrête sur un vrai échec de vérification / BLOCKED (humain requis), et va jusqu'à ${TRACK}${LAST}. Assure-toi d'abord que le dev server :3000 répond (sinon 'npm run dev -w @aidos/web' en arrière-plan). À ${TRACK}${LAST} atteint : commit groupé + push sur build/s00-s47, puis rebascule :3000 en build prod ('next build' + 'next start'). Ne fais RIEN d'autre que ce build. Le mur reste intact : aucune écriture kernel/mirrors/fitness hors idée→miroir→/goal."
log "[$TRACK] RELAUNCH from $CURSOR (last_done=$last_done) in tmux aidos-build"
tmux new-session -d -s aidos-build \
  "cd $REPO && $CLAUDE --permission-mode bypassPermissions --effort xhigh \"$PROMPT\" >>/tmp/aidos-autoresume-claude.log 2>&1; echo \"\$(date) claude session ended\" >>$LOG"
exit 0
