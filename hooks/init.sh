#!/bin/bash
# hooks/init.sh — SessionStart hook (matcher: compact)
#
# Detects multiple worktrees and instructs Claude to confirm with the user.
# Installed globally — silently exits if not in a git repo or single worktree.

set -euo pipefail

# Not in a git repo → silent exit (global hook, may run outside repos)
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

WORKTREE_COUNT=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')

# Single worktree → nothing to report
if [ "$WORKTREE_COUNT" -le 1 ]; then
  exit 0
fi

CURRENT_DIR=$(pwd)
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")

cat <<EOF
⚠️ COMPACTION DÉTECTÉE — Contexte worktree à confirmer.

Répertoire actuel : ${CURRENT_DIR}
Branche actuelle  : ${CURRENT_BRANCH}

Worktrees disponibles :
$(git worktree list 2>/dev/null | while IFS= read -r line; do echo "  - ${line}"; done)

INSTRUCTION OBLIGATOIRE : Avant de reprendre toute tâche, utilise AskUserQuestion pour demander à l'utilisateur sur quel worktree il travaille actuellement. Propose les worktrees ci-dessus comme options. Adapte ensuite TOUS tes chemins absolus au répertoire sélectionné par l'utilisateur. Utilise /worktree-monitor:set pour sauvegarder le choix.
EOF
