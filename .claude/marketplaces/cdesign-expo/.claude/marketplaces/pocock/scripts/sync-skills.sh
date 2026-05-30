#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM_REPO="https://github.com/mattpocock/skills.git"
SKILLS_DIR="$REPO_ROOT/skills"
SHA_FILE="$REPO_ROOT/.upstream-sha"

# Create a temp directory and ensure cleanup
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Cloning upstream repo (shallow)..."
git clone --depth 1 "$UPSTREAM_REPO" "$TMPDIR/upstream"

# Record the upstream commit SHA
UPSTREAM_SHA="$(git -C "$TMPDIR/upstream" rev-parse HEAD)"
echo "$UPSTREAM_SHA" > "$SHA_FILE"
echo "Upstream SHA: $UPSTREAM_SHA"

# Remove existing skills and recreate
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"

# Copy each skill directory (directories containing SKILL.md)
echo "Copying skills..."
COUNT=0
for skill_dir in "$TMPDIR/upstream"/*/; do
  skill_name="$(basename "$skill_dir")"
  if [ -f "$skill_dir/SKILL.md" ]; then
    cp -r "$skill_dir" "$SKILLS_DIR/$skill_name"
    echo "  - $skill_name"
    COUNT=$((COUNT + 1))
  fi
done

echo "Synced $COUNT skills from mattpocock/skills@${UPSTREAM_SHA:0:7}"
