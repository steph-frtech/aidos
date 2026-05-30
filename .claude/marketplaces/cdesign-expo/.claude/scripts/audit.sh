#!/usr/bin/env bash
# claude-code-up-generated security audit script.
# Scans this project's .claude/ directory using agentshield CLI.
# Source: https://github.com/affaan-m/agentshield
set -euo pipefail

cd "$(dirname "$0")/../.."
exec npx --yes ecc-agentshield scan "$@"
