#!/usr/bin/env bash
# Statusline composite : exécute en haut tous les helpers de statusline fournis
# par des plugins (superpowers, etc.), puis affiche notre bloc
# custom (rate limits, tokens, diff) TOUJOURS EN BAS, quoi qu'il arrive.
input=$(cat)

# ── 1. Panneaux fournis par les plugins (en haut, optionnel) ────────────────
shopt -s nullglob
declare -A SEEN_HELPERS=()
# On ne lit QUE les plugins installés (plugins/cache/<marketplace>/<plugin>/<version>/),
# jamais les sources de marketplace (plugins/marketplaces/) qui ne sont pas installées.
HELPER_PATTERNS=(
  "$HOME/.claude/plugins/cache/"*"/"*"/"*"/helpers/statusline.cjs"
  "$HOME/.claude/plugins/cache/"*"/"*"/"*"/helpers/statusline.js"
  "$HOME/.claude/plugins/cache/"*"/"*"/"*"/helpers/statusline.sh"
)

run_helper() {
  local helper="$1" out=""
  case "$helper" in
    *.cjs|*.js)
      command -v node >/dev/null 2>&1 || return 0
      out=$(printf '%s' "$input" | timeout 1s node "$helper" 2>/dev/null) ;;
    *.sh)
      out=$(printf '%s' "$input" | timeout 1s bash "$helper" 2>/dev/null) ;;
    *) return 0 ;;
  esac
  if [ -n "$out" ]; then
    printf '%s' "$out"
    [ "${out: -1}" != $'\n' ] && printf '\n'
  fi
}

for pattern in "${HELPER_PATTERNS[@]}"; do
  for helper in $pattern; do
    [ -f "$helper" ] || continue
    [ -n "${SEEN_HELPERS[$helper]:-}" ] && continue
    SEEN_HELPERS[$helper]=1
    run_helper "$helper"
  done
done
shopt -u nullglob

# ── 2. Bloc custom (toujours en dernier, en bas) ────────────────────────────
j() { echo "$input" | jq -r "$1" 2>/dev/null; }

model=$(j '.model.display_name // "?"')
model_id=$(j '.model.id // ""')
added=$(j '.cost.total_lines_added // 0')
removed=$(j '.cost.total_lines_removed // 0')
dir=$(j '.workspace.current_dir // .cwd')
exceeds=$(j '.exceeds_200k_tokens // false')
transcript=$(j '.transcript_path // empty')
user_host="$(whoami)@$(hostname -s)"

window=200000
if [[ "$model_id" == *"1m"* ]]; then window=1000000; fi

tokens=0
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  tokens=$(jq -r 'select(.type=="assistant") | .message.usage | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' "$transcript" 2>/dev/null | tail -n 1)
fi
tokens=${tokens:-0}
[ -z "$tokens" ] && tokens=0

ctx_pct=$(awk "BEGIN { printf \"%.0f\", ($tokens / $window) * 100 }")
ctx_human=$(awk "BEGIN { t=$tokens; if (t>=1000000) printf \"%.1fM\", t/1000000; else if (t>=1000) printf \"%dk\", t/1000; else printf \"%d\", t }")
win_human=$(awk "BEGIN { w=$window; if (w>=1000000) printf \"%dM\", w/1000000; else printf \"%dk\", w/1000 }")

color_for() {
  local p=${1:-0}
  if   [ "$p" -ge 90 ]; then printf "\033[1;97;41m"
  elif [ "$p" -ge 75 ]; then printf "\033[1;30;43m"
  elif [ "$p" -ge 50 ]; then printf "\033[1;30;46m"
  else                       printf "\033[1;97;42m"
  fi
}

limit_block() {
  local key=$1 icon=$2 label=$3
  local pct reset reset_str
  pct=$(j ".rate_limits.${key}.used_percentage // empty")
  [ -z "$pct" ] || [ "$pct" = "null" ] && return
  pct=$(printf "%.0f" "$pct" 2>/dev/null || echo 0)
  reset=$(j ".rate_limits.${key}.resets_at // empty")
  reset_str=""
  if [ -n "$reset" ] && [ "$reset" != "null" ]; then
    reset_str=" (→$(date -d "@$reset" +%H:%M 2>/dev/null))"
  fi
  printf " $(color_for "$pct") %s %s %s%%%s \033[0m" "$icon" "$label" "$pct" "$reset_str"
}

ctx_color=$(color_for "$ctx_pct")

warn=""
if [ "$exceeds" = "true" ]; then warn="  \033[1;97;41m ⚠️  200k+ \033[0m"; fi

printf "\033[1;97;44m 👤 %s \033[0m \033[1;97;45m 🤖 %s \033[0m ${ctx_color} 🧠 %s/%s (%s%%) \033[0m" \
  "$user_host" "$model" "$ctx_human" "$win_human" "$ctx_pct"

# Limits
limit_block five_hour        "⏱️"  "5h"
limit_block seven_day        "📅" "7d"
limit_block seven_day_opus   "🔥" "Opus 7d"
limit_block seven_day_sonnet "✨" "Sonnet 7d"

printf " \033[1;97;46m ✏️  +%d/-%d \033[0m${warn}  \033[1;97;42m 📁 %s \033[0m" \
  "$added" "$removed" "$dir"

# ── 3. ccup inventory line (live K / configured T per category) ─────────────
# K = files actually on disk; T = what stack.json / settings.json claim.
# Color codes health: green K==T, yellow 0<K<T, red K==0 && T>0, dim T==0.
stack_json="$dir/.claude/stack.json"
mcp_json="$dir/.mcp.json"
mcp_status="$dir/.claude/mcp-status.json"
settings_json="$dir/.claude/settings.json"

if [ -f "$stack_json" ] || [ -f "$mcp_json" ] || [ -f "$settings_json" ]; then
  # T values (what's configured / claimed)
  cc_skills_t=0; cc_agents_t=0; cc_commands_t=0; cc_scripts_t=0
  cc_hooks_t=0; cc_mcp_t=0
  if [ -f "$stack_json" ]; then
    cc_skills_t=$(jq -r '.totals.project.skills // 0' "$stack_json" 2>/dev/null || echo 0)
    cc_agents_t=$(jq -r '.totals.project.agents // 0' "$stack_json" 2>/dev/null || echo 0)
    cc_commands_t=$(jq -r '.totals.project.commands // 0' "$stack_json" 2>/dev/null || echo 0)
    cc_scripts_t=$(jq -r '.totals.project.scripts // 0' "$stack_json" 2>/dev/null || echo 0)
  fi
  if [ -f "$settings_json" ]; then
    cc_hooks_t=$(jq -r '[(.hooks // {}) | to_entries[] | .value[]? | (.hooks // [])[]?] | length' "$settings_json" 2>/dev/null || echo 0)
  fi
  if [ -f "$mcp_json" ]; then
    cc_mcp_t=$(jq -r '.mcpServers // {} | keys | length' "$mcp_json" 2>/dev/null || echo 0)
  fi

  # K values (files actually on disk / verifications passing)
  cc_skills_k=$(find "$dir/.claude/skills" -maxdepth 2 -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
  cc_agents_k=$(find "$dir/.claude/agents" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  cc_commands_k=$(find "$dir/.claude/commands" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  # Scripts live in two places: .claude/scripts/*.sh (audit.sh etc) and the
  # statusline.sh which Claude Code wants at .claude/statusline.sh.
  cc_scripts_k=$(find "$dir/.claude/scripts" -maxdepth 1 -name "*.sh" 2>/dev/null | wc -l | tr -d ' ')
  if [ -f "$dir/.claude/statusline.sh" ]; then
    cc_scripts_k=$((cc_scripts_k + 1))
  fi
  cc_hooks_k=$cc_hooks_t   # hooks: trust settings.json
  cc_mcp_k=0
  if [ -f "$mcp_status" ]; then
    cc_mcp_k=$(jq -r '[(.servers // {}) | to_entries[] | select(.value=="ok")] | length' "$mcp_status" 2>/dev/null || echo 0)
  fi

  # Pick color/marker based on health: green K==T, yellow 0<K<T, red K=0 T>0, dim T=0
  segment() {
    local k=$1 t=$2 icon=$3 label=$4
    local color marker
    if [ "$t" -eq 0 ] && [ "$k" -eq 0 ]; then
      color="\033[1;97;48;5;238m"   # dim
      marker="0"
    elif [ "$k" -eq "$t" ] && [ "$t" -gt 0 ]; then
      color="\033[1;97;42m"          # green
      marker="${k}/${t} ✓"
    elif [ "$k" -gt 0 ] && [ "$k" -lt "$t" ]; then
      color="\033[1;30;43m"          # yellow
      marker="${k}/${t} ⚠"
    elif [ "$k" -eq 0 ] && [ "$t" -gt 0 ]; then
      color="\033[1;97;41m"          # red
      marker="0/${t} ✗"
    else
      # K > T (more on disk than claimed — uncommon)
      color="\033[1;97;48;5;238m"
      marker="${k}/${t}"
    fi
    printf "%b %s %s \033[0m " "$color" "$icon" "$marker $label"
  }

  printf "\n"
  segment "$cc_skills_k"   "$cc_skills_t"   "📦" "skills"
  segment "$cc_agents_k"   "$cc_agents_t"   "🤖" "agents"
  segment "$cc_mcp_k"      "$cc_mcp_t"      "🔌" "MCPs"
  segment "$cc_hooks_k"    "$cc_hooks_t"    "🪝" "hooks"
  segment "$cc_commands_k" "$cc_commands_t" "⚡" "commands"
  segment "$cc_scripts_k"  "$cc_scripts_t"  "📜" "scripts"
fi
