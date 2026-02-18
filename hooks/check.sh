#!/bin/bash
# hooks/check.sh — PreToolUse / PostToolUse hook
#
# Checks that file operations stay within the active worktree root.
# Behavior controlled by WORKTREE_MONITOR_MODE env var: "pre" or "post"
#
# Pre mode:  exit 2 + JSON deny → blocks the operation
# Post mode: stdout warning → informational only
#
# Requires: jq

set -euo pipefail

MODE="${WORKTREE_MONITOR_MODE:-pre}"

# Read stdin JSON
INPUT=$(cat)

# Extract tool name and file path from input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty' 2>/dev/null)

if [ -z "$TOOL_NAME" ] || [ -z "$TOOL_INPUT" ]; then
  exit 0
fi

# Extract path based on tool type
FILE_PATH=""
case "$TOOL_NAME" in
  Read|Write|Edit|MultiEdit)
    FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
    ;;
  Glob|Grep)
    FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.path // empty' 2>/dev/null)
    ;;
  *)
    # Unknown tool — let it through
    exit 0
    ;;
esac

# No path in input → let it through
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Allowlist: /tmp/*, ~/.claude/*, /dev/*
case "$FILE_PATH" in
  /tmp|/tmp/*|/private/tmp|/private/tmp/*)
    exit 0
    ;;
  "$HOME/.claude"|"$HOME/.claude/"*)
    exit 0
    ;;
  /dev|/dev/*)
    exit 0
    ;;
esac

# Normalize path — macOS-compatible (no realpath -m)
normalize_path() {
  python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$1" 2>/dev/null || echo "$1"
}

NORM_PATH=$(normalize_path "$FILE_PATH")

# Determine expected root
# Strategy: try git root from file's directory, fallback to hook CWD's git root
# Priority: pin file > git rev-parse
EXPECTED_ROOT=""
GIT_ROOT=""

# Try deriving git root from the file path's directory (handles non-CWD projects)
FILE_DIR=$(dirname "$NORM_PATH")
if [ -d "$FILE_DIR" ]; then
  GIT_ROOT=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null || true)
fi

# Fallback: derive git root from hook's CWD (Claude Code runs hooks from project dir)
if [ -z "$GIT_ROOT" ]; then
  GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
fi

if [ -n "$GIT_ROOT" ]; then
  # Check for pinned root file (written by /worktree-monitor:set)
  PIN_FILE="${GIT_ROOT}/.claude/.worktree-monitor-root"
  if [ -f "$PIN_FILE" ]; then
    EXPECTED_ROOT=$(cat "$PIN_FILE" 2>/dev/null | tr -d '[:space:]')
  fi
fi

# Fallback to git toplevel
if [ -z "$EXPECTED_ROOT" ]; then
  EXPECTED_ROOT="$GIT_ROOT"
fi

# Cannot determine root → fail-open
if [ -z "$EXPECTED_ROOT" ]; then
  exit 0
fi

NORM_ROOT=$(normalize_path "$EXPECTED_ROOT")

# Check if path is within root
case "$NORM_PATH" in
  "$NORM_ROOT"|"$NORM_ROOT"/*)
    # Within worktree → OK
    exit 0
    ;;
esac

# Out of worktree!
if [ "$MODE" = "pre" ]; then
  # Block the operation
  cat <<EOF
{"decision":"block","reason":"⛔ Worktree Monitor: opération bloquée — le chemin '$FILE_PATH' est hors du worktree actif ($EXPECTED_ROOT). Utilisez /worktree-monitor:set pour changer de worktree."}
EOF
  exit 2
else
  # Post mode: warning only
  echo "⚠️ Worktree Monitor: le chemin '$FILE_PATH' est hors du worktree actif ($EXPECTED_ROOT)."
  exit 0
fi
