#!/usr/bin/env bash
# Runs ONLY the e2e spec that was just edited (path read from the hook JSON).
# The playwright webServer block manages the dev server. Light variant: swap
# `--reporter=line` for `--list` to only check the spec is discoverable (no browser).
set -euo pipefail
INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
case "$FILE" in
  *tests/e2e/*.spec.ts|*tests/e2e/*.spec.tsx)
    # light guard: confirm the spec is discoverable/compiles, no browser or dev server.
    # for a full run use the playwright-tester agent or `npm run test:e2e -- <file>`.
    echo "▶ e2e discover $FILE"
    npx playwright test "$FILE" --list
    ;;
  *) exit 0 ;;
esac
