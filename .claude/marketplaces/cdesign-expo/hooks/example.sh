#!/usr/bin/env bash
# Example Claude Code hook — reads JSON from stdin, exits 0 to allow.
set -euo pipefail
INPUT=$(cat)
# Inspect $INPUT, make a decision.
exit 0
