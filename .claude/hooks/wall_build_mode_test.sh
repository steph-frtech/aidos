#!/usr/bin/env bash
# Fault-injection mirror for the TWO-LEVEL wall (ADR 0091), at the wall.sh shim layer.
#
# The Go classifier (back/hooks/pretooluse) is the AUTHORITY and has its own mirrors
# (wall_property_test / wall_bdd_test) — UNCHANGED. This shell test pins the SHIM contract:
#   - PRODUCT mode (no AIDOS_BUILD_MODE): a truth-store write is DENIED (exit 2) — the wall
#     the END USER's agent meets (the product guarantee; also enforced server-side).
#   - CONSTRUCTION mode (AIDOS_BUILD_MODE=1): the same write is AUDITED but ALLOWED (exit 0)
#     — the AIDOS-CONSTRUCTOR agent builds the substrate (migrations/kernel) and is never
#     blocked.
#   - a below-the-line write is ALLOWED in both modes (no over-block).
#
# Run: bash .claude/hooks/wall_build_mode_test.sh  (exit 0 = green).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
SHIM=.claude/hooks/wall.sh
export CLAUDE_PROJECT_DIR="$PWD"
TRUTH='{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/back/migrations/kernel_x.sql"}}'
SAFE='{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/front/web/x.ts"}}'
fail=0

# 1. PRODUCT mode: truth-store write DENIED (exit 2).
env -u AIDOS_BUILD_MODE bash "$SHIM" >/dev/null 2>&1 <<<"$TRUTH"
[[ $? -eq 2 ]] || { echo "FAIL: product mode must DENY a back/migrations write (exit 2)"; fail=1; }

# 2. CONSTRUCTION mode: same write AUDITED + ALLOWED (exit 0).
AIDOS_BUILD_MODE=1 bash "$SHIM" >/dev/null 2>&1 <<<"$TRUTH"
[[ $? -eq 0 ]] || { echo "FAIL: build mode must AUDIT+ALLOW a back/migrations write (exit 0)"; fail=1; }

# 3. below-the-line write ALLOWED in both modes.
env -u AIDOS_BUILD_MODE bash "$SHIM" >/dev/null 2>&1 <<<"$SAFE"
[[ $? -eq 0 ]] || { echo "FAIL: a below-line (front) write must be allowed in product mode"; fail=1; }
AIDOS_BUILD_MODE=1 bash "$SHIM" >/dev/null 2>&1 <<<"$SAFE"
[[ $? -eq 0 ]] || { echo "FAIL: a below-line (front) write must be allowed in build mode"; fail=1; }

if [[ $fail -eq 0 ]]; then echo "✓ wall two-level shim: product DENIES, construction AUDITS+ALLOWS, below-line free"; fi
exit $fail
