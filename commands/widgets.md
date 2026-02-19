---
name: widgets
description: Configure status line widgets with visual preview — choose presets or pick individual widgets
allowed-tools: Read, Write, Edit, Bash(node:*), AskUserQuestion
---

# Worktree Monitor — Widget Configurator

Configure les widgets affichés dans la status line de Claude Code.

## Constantes

- Config file: `~/.claude/worktree-monitor.json`

## Étapes

### 1. Charger la configuration actuelle

Lire `~/.claude/worktree-monitor.json`. Si absent, partir des defaults :
```json
{
  "hooks": { "sessionStart": true, "preToolUse": false, "postToolUse": false },
  "widgets": ["worktree", "model", "context"]
}
```

Afficher la configuration actuelle des widgets à l'utilisateur.

### 2. Proposer les presets avec preview

Utiliser `AskUserQuestion` avec des previews markdown pour chaque preset.

**Question** : "Quel profil de widgets souhaitez-vous ?"

**Options avec preview** (multiSelect: false) :

#### Option 1 : `Minimal (Recommandé)`
Description : "Essentiel — projet, modèle et contexte"
```
📁 my-app [main] │ 🤖 Opus │ 42% 85k/200k
```

#### Option 2 : `Git`
Description : "Ajoute ahead/behind, dirty, état git"
```
📁 my-app [main] │ 🤖 Opus │ 42% 85k/200k │ ⬆1 ⬇0 │ ✏️ 3 dirty │ ⚠️ REBASE
```

#### Option 3 : `Git complet`
Description : "Tous les widgets git : diff, stash, tag, commits…"
```
📁 my-app [main] │ 🤖 Opus │ 42% 85k/200k │ ⬆1 ⬇0 │ ✏️ 3 dirty │ +42 -17 │ 📦 2 stash │ 🕐 2h ago │ 🔀 5 commits │ 🏷 v1.2.0
```

#### Option 4 : `Personnalisé`
Description : "Choisir les widgets un par un"

### 3. Si "Personnalisé" est choisi

Utiliser `AskUserQuestion` (multiSelect: true) pour proposer TOUS les widgets individuels.

**Question** : "Quels widgets voulez-vous afficher ?"

Les 3 widgets de base (worktree, model, context) sont toujours inclus.

**Options** (widgets optionnels uniquement) :
- `git-ahead-behind` — Commits en avance/retard vs upstream (⬆1 ⬇0)
- `git-dirty` — Fichiers modifiés (✏️ 3 dirty)
- `git-diff-stat` — Lignes ajoutées/supprimées (+42 -17)
- `git-stash` — Nombre de stashs (📦 2 stash)

**Question 2** : "Quels widgets supplémentaires voulez-vous ?"
- `git-last-commit` — Âge du dernier commit (🕐 2h ago)
- `git-branch-commits` — Commits vs main (🔀 5 commits)
- `git-state` — État git : MERGE, REBASE… (⚠️ REBASE)
- `git-tag` — Tag courant (🏷 v1.2.0)

**Question 3** : "Quels widgets worktree multi-repo voulez-vous ?"
- `wt-count` — Nombre de worktrees (🌳 3 wt)
- `wt-dirty` — Worktrees propres vs total (🌳 2/3 clean)
- `wt-branches` — Branches de tous les worktrees

### 4. Construire la liste de widgets

Selon le choix :

- **Minimal** : `["worktree", "model", "context"]`
- **Git** : `["worktree", "model", "context", "git-ahead-behind", "git-dirty", "git-state"]`
- **Git complet** : `["worktree", "model", "context", "git-ahead-behind", "git-dirty", "git-diff-stat", "git-stash", "git-last-commit", "git-branch-commits", "git-state", "git-tag"]`
- **Personnalisé** : `["worktree", "model", "context", ...choix utilisateur]`

### 5. Preview finale et confirmation

Construire une preview ASCII de la status line résultante et l'afficher à l'utilisateur.

Utiliser `AskUserQuestion` pour confirmer :

**Question** : "Appliquer cette configuration ?"
- `Oui, sauvegarder` — Applique les changements
- `Non, recommencer` — Retour à l'étape 2

### 6. Sauvegarder

Lire `~/.claude/worktree-monitor.json`, mettre à jour UNIQUEMENT la clé `widgets` avec la nouvelle liste, et réécrire le fichier en préservant les autres clés (hooks, etc.).

### 7. Résumé

Afficher :
- Widgets actifs (liste)
- Preview de la status line
- Instruction : "Relancez Claude Code pour appliquer les changements"
