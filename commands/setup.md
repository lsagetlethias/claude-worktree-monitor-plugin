---
name: setup
description: Configure worktree-monitor — hooks, status line, and plugin registration in global Claude Code settings
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(node:*), Bash(pnpm:*), Bash(jq:*), AskUserQuestion
---

# Worktree Monitor — Setup

Configure le plugin worktree-monitor dans les settings globaux de Claude Code.

## Constantes

- Config file: `~/.claude/worktree-monitor.json`
- Global settings: `~/.claude/settings.json`

## Étapes

### 1. Détecter le chemin d'installation du plugin

Le plugin peut être installé à plusieurs endroits. Détermine le chemin d'installation en cherchant dans cet ordre :
1. `~/.claude/plugins/local/worktree-monitor/` (installation locale)
2. `~/.claude/plugins/cache/*/worktree-monitor/*/` (installation via marketplace)
3. Demander à l'utilisateur si non trouvé

Stocke ce chemin dans une variable `$PLUGIN_PATH` pour les étapes suivantes.

### 2. Vérifier le build du plugin

Vérifie que `$PLUGIN_PATH/dist/index.js` existe.
Si absent, exécuter `cd $PLUGIN_PATH && pnpm install && pnpm build`.

### 3. Charger la configuration actuelle

Lire `~/.claude/worktree-monitor.json` s'il existe. Sinon, partir des defaults :
```json
{
  "hooks": { "sessionStart": true, "preToolUse": false, "postToolUse": false },
  "widgets": ["worktree", "model", "context"]
}
```

### 4. Demander les préférences utilisateur

Utiliser `AskUserQuestion` pour demander quels hooks activer :

**Question 1** : "Quels hooks worktree-monitor voulez-vous activer ?"
- Options (multiSelect: true) :
  - `SessionStart (compact)` — Alerte après compaction si plusieurs worktrees (recommandé)
  - `PreToolUse (file guard)` — Bloque les opérations fichier hors du worktree actif
  - `PostToolUse (file warn)` — Avertissement non-bloquant pour les opérations hors worktree

### 4b. Demander les widgets git

Utiliser `AskUserQuestion` pour demander quels widgets git activer :

**Question 2** : "Quel niveau de widgets git souhaitez-vous ?"
- Options :
  - `Essentiel (Recommandé)` — Ajoute `git-ahead-behind`, `git-dirty`, `git-state` à la liste de widgets
  - `Complet` — Ajoute tous les widgets git : `git-ahead-behind`, `git-dirty`, `git-diff-stat`, `git-stash`, `git-last-commit`, `git-branch-commits`, `git-state`, `git-tag`, `wt-count`, `wt-dirty`, `wt-branches`
  - `Minimal` — N'ajoute aucun widget git (garde uniquement worktree, model, context)

Les widgets choisis sont ajoutés après les widgets de base (`worktree`, `model`, `context`).

### 5. Sauvegarder la configuration

Écrire `~/.claude/worktree-monitor.json` avec les choix de l'utilisateur.

### 6. Mettre à jour les settings globaux

Lire `~/.claude/settings.json` et mettre à jour :

**statusLine** :
```json
"statusLine": {
  "type": "command",
  "command": "node $PLUGIN_PATH/dist/index.js"
}
```
(Remplacer `$PLUGIN_PATH` par le chemin absolu réel déterminé à l'étape 1)

**hooks** — Les hooks PreToolUse et PostToolUse sont désormais déclarés dans `hooks.json` du plugin (activés automatiquement). Pour les désactiver, l'utilisateur peut retirer le plugin des `enabledPlugins` ou ajuster `~/.claude/worktree-monitor.json`.

**IMPORTANT** : Préserver toutes les clés existantes dans settings.json (permissions, model, language, etc.). Ne modifier QUE les clés listées ci-dessus. Si des hooks existants non-worktree-monitor sont présents, les conserver.

### 7. Vérification

- Relire `~/.claude/settings.json` et confirmer les changements
- Afficher un résumé :
  - Plugin path détecté
  - Hooks activés (SessionStart via hooks.json du plugin + PreToolUse/PostToolUse si activés)
  - Status line configurée
  - Instruction : "Relancez Claude Code pour appliquer les changements"
