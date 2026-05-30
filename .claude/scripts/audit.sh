#!/usr/bin/env bash
# Advisory security audit at Stop (claude-code-up generated, agentshield CLI).
# Source: https://github.com/affaan-m/agentshield
#
# It RUNS the scan for visibility but is ADVISORY — it never blocks or errors the
# Stop. agentshield exits non-zero when it has findings; here the permissive
# permission posture (bypassPermissions + broad allow in settings.local.json) is a
# deliberate project choice, so findings are informational, not failures. Read the
# report when you want it: `npx --yes ecc-agentshield scan .claude`.
set -uo pipefail

cd "$(dirname "$0")/../.."
# Run the scan; swallow its findings exit code so Stop never reports an error.
npx --yes ecc-agentshield scan "$@" || true
exit 0
