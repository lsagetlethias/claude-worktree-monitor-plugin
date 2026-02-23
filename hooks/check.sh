#!/bin/bash
# hooks/check.sh — PreToolUse / PostToolUse hook
#
# Checks that file operations stay within the active worktree root.
# Behavior controlled by WORKTREE_MONITOR_MODE env var: "pre" or "post"
#
# Smart cross-worktree access control:
#   - Path not in any git repo        → auto-accept (silent)
#   - Path in a different git repo     → auto-accept (silent)
#   - Path in same repo, other worktree → check permissions file
#     (readonly / readwrite / not set → block with guidance)
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

# Normalize path — macOS-compatible, resolves symlinks (e.g. /var → /private/var)
normalize_path() {
  python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$1" 2>/dev/null || echo "$1"
}

# Walk up directory tree to find first existing ancestor
find_existing_ancestor() {
  local dir="$1"
  # Guard against empty/whitespace input
  if [ -z "$dir" ]; then
    echo "/"
    return
  fi
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
    dir=$(dirname "$dir")
  done
  echo "$dir"
}

# Resolve git-common-dir to an absolute, normalized path.
# git-common-dir can return relative paths (e.g. ".git") from the main worktree.
resolve_git_common_dir() {
  local dir="$1"
  local raw
  raw=$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null) || return 1
  if [[ "$raw" = /* ]]; then
    normalize_path "$raw"
  else
    normalize_path "$dir/$raw"
  fi
}

# Classify tool as read-only or write operation
is_read_operation() {
  case "$1" in
    Read|Glob|Grep) return 0 ;;
    *) return 1 ;;
  esac
}

NORM_PATH=$(normalize_path "$FILE_PATH")

# Determine expected root from CWD (Claude Code runs hooks from the project directory)
# Priority: pin file > git rev-parse from CWD
EXPECTED_ROOT=""
GIT_ROOT=""

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)

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

# --- Path is OUTSIDE current worktree root ---
# Smart decision: check if target is in the same repo (another worktree) or unrelated.

# Find effective directory for the target path (walk up if doesn't exist yet)
TARGET_DIR=$(find_existing_ancestor "$(dirname "$NORM_PATH")")

# Step A: Is the target path in a git repo at all?
TARGET_COMMON=$(resolve_git_common_dir "$TARGET_DIR") || {
  # Target is NOT in a git repo → auto-accept
  exit 0
}

# Step B: Is the current session in a git repo?
CURRENT_COMMON=$(resolve_git_common_dir "$(pwd)") || {
  # Current session not in git → fail-open
  exit 0
}

# Step C: Same repo?
if [ "$TARGET_COMMON" != "$CURRENT_COMMON" ]; then
  # Different repo entirely → auto-accept
  exit 0
fi

# --- Same repo, different worktree ---

# Find the target worktree root
TARGET_WT_ROOT=$(git -C "$TARGET_DIR" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$TARGET_WT_ROOT" ]; then
  # Cannot determine target worktree root → fail-open
  exit 0
fi
TARGET_WT_ROOT=$(normalize_path "$TARGET_WT_ROOT")

# Post mode: warn only, don't block
if [ "$MODE" != "pre" ]; then
  echo "⚠️ Worktree Monitor: le chemin '$FILE_PATH' est dans un autre worktree du même repo ($TARGET_WT_ROOT) — worktree actif : $EXPECTED_ROOT."
  exit 0
fi

# Pre mode: check permissions file
# No -f guard: jq handles missing/corrupted files, || true prevents set -e fail-open
PERMS_FILE="${NORM_ROOT}/.claude/.worktree-monitor-permissions"
PERMISSION=$(jq -r --arg wt "$TARGET_WT_ROOT" '.[$wt] // empty' "$PERMS_FILE" 2>/dev/null || true)

case "$PERMISSION" in
  readwrite)
    # Full access granted
    exit 0
    ;;
  readonly)
    if is_read_operation "$TOOL_NAME"; then
      # Read operations allowed
      exit 0
    else
      # Write operation on readonly worktree → block with upgrade message
      # Use jq to properly escape shell variables in JSON output
      REASON=$(cat <<REASON_EOF
⛔ Worktree Monitor: écriture bloquée — le worktree '$TARGET_WT_ROOT' a un accès readonly.

Le chemin '$FILE_PATH' est dans un autre worktree du même repo.
Accès actuel : readonly (Read/Glob/Grep autorisés, Write/Edit/MultiEdit bloqués).

Demande à l'utilisateur avec AskUserQuestion s'il veut passer en readwrite.
Puis mets à jour le fichier : $PERMS_FILE
Clé : "$TARGET_WT_ROOT" → valeur : "readwrite"
REASON_EOF
)
      jq -cn --arg reason "$REASON" '{"decision":"block","reason":$reason}'
      exit 2
    fi
    ;;
  *)
    # No permission recorded → block with grant message
    # Use jq to properly escape shell variables in JSON output
    REASON=$(cat <<REASON_EOF
⛔ Worktree Monitor: accès inter-worktree non autorisé.

Le chemin '$FILE_PATH' est dans un autre worktree du même repo :
  Worktree cible  : $TARGET_WT_ROOT
  Worktree actif  : $EXPECTED_ROOT

Aucune permission enregistrée.

Demande à l'utilisateur avec AskUserQuestion quel accès accorder :
  1. readonly  — Read, Glob, Grep uniquement
  2. readwrite — toutes les opérations fichier

Puis sauvegarde dans : $PERMS_FILE
Format JSON : { "$TARGET_WT_ROOT": "readonly" }

Si le fichier n'existe pas, crée-le (mkdir -p pour le dossier .claude/).
REASON_EOF
)
    jq -cn --arg reason "$REASON" '{"decision":"block","reason":$reason}'
    exit 2
    ;;
esac
