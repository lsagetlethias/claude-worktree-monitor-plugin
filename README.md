# worktree-monitor

Plugin Claude Code pour le monitoring et la protection des git worktrees.

## Fonctionnalités

- **Status line** — Affiche en permanence le worktree actif, le modèle Claude, et l'utilisation du contexte
- **Hook SessionStart** — Alerte après compaction si plusieurs worktrees existent (confirmation utilisateur)
- **Hook PreToolUse** — Bloque les opérations fichier hors du worktree actif (opt-in)
- **Hook PostToolUse** — Avertissement non-bloquant pour les opérations hors worktree (opt-in)
- **Skills** — `/worktree-monitor:setup` pour configurer, `/worktree-monitor:set` pour sélectionner un worktree, `/worktree-monitor:widgets` pour configurer les widgets

## Prérequis

- Claude Code CLI
- Node.js 22+
- pnpm
- git

## Installation

Dans une session Claude Code :

```
/plugin marketplace add lsagetlethias/claude-worktree-monitor-plugin
/plugin install worktree-monitor
```

Puis lancer `/worktree-monitor:setup` pour configurer les hooks et la status line.

### Installation manuelle

```bash
git clone https://github.com/lsagetlethias/claude-worktree-monitor-plugin.git \
  ~/.claude/plugins/local/worktree-monitor

cd ~/.claude/plugins/local/worktree-monitor
pnpm install
pnpm build
```

Puis lancer `/worktree-monitor:setup` dans une session Claude Code.

## Status line

```
📁 my-app [main] │ 🤖 Opus 4.6 │ 42% 85k/200k
```

### Widgets disponibles

#### Base

| Widget ID | Exemple | Description |
|---|---|---|
| `worktree` | `📁 my-app [main]` / `🌳 my-app [main]` | Projet + branche (🌳 si worktree secondaire) |
| `model` | `🤖 Opus 4.6` | Modèle Claude actif |
| `context` | `42% 85k/200k` | Utilisation du contexte (tokens utilisés/total) |

#### Git

| Widget ID | Exemple | Description |
|---|---|---|
| `git-ahead-behind` | `⬆1 ⬇0` | Commits en avance/retard vs upstream |
| `git-dirty` | `✏️ 3 dirty` | Fichiers modifiés (ou `clean`) |
| `git-diff-stat` | `+42 -17` | Lignes ajoutées/supprimées (unstaged) |
| `git-stash` | `📦 2 stash` | Entrées dans le stash (masqué si 0) |
| `git-last-commit` | `🕐 2h ago` | Age du dernier commit |
| `git-branch-commits` | `🔀 5 commits` | Commits sur la branche vs main/master |
| `git-state` | `⚠️ REBASE` | Etat git actif (merge, rebase, cherry-pick, revert) |
| `git-tag` | `🏷 v1.2.0` | Tag courant |

#### Multi-worktree

| Widget ID | Exemple | Description |
|---|---|---|
| `wt-count` | `🌳 3 wt` | Nombre total de worktrees (masqué si ≤ 1) |
| `wt-dirty` | `🌳 2/3 clean` | Worktrees propres vs total |
| `wt-branches` | `🌳 main│feat│fix` | Branches de tous les worktrees |

### Presets

| Preset | Widgets |
|---|---|
| **Minimal** (défaut) | `worktree`, `model`, `context` |
| **Git** | Minimal + `git-ahead-behind`, `git-dirty`, `git-state` |
| **Git complet** | Git + tous les widgets git et multi-worktree |
| **Personnalisé** | Sélection interactive widget par widget |

Les widgets git ne déclenchent des commandes git que s'ils sont activés — le preset Minimal n'exécute aucune commande git.

### Configuration

Les widgets se configurent via `/worktree-monitor:widgets` ou manuellement dans `~/.claude/worktree-monitor.json` :

```json
{
  "hooks": { ... },
  "widgets": ["worktree", "model", "context", "git-dirty", "git-state"]
}
```

Le tableau `widgets` détermine quels widgets sont affichés et dans quel ordre.

## Hooks

| Hook | Comportement | Par défaut |
|---|---|---|
| `SessionStart` (compact) | Liste les worktrees et demande confirmation | Actif |
| `PreToolUse` (file guard) | Bloque Read/Write/Edit/Glob/Grep hors worktree | Inactif |
| `PostToolUse` (file warn) | Warning non-bloquant pour les opérations hors worktree | Inactif |

Les hooks PreToolUse et PostToolUse s'activent via `/worktree-monitor:setup`.

### Allowlist

Les chemins suivants ne sont jamais bloqués par les hooks :
- `/tmp/*`
- `~/.claude/*`
- `/dev/*`

### Fail-open

Si le worktree root ne peut pas être déterminé (pas de repo git, pas de jq), les hooks laissent passer silencieusement.

## Skills

### `/worktree-monitor:setup`

Configure le plugin : hooks à activer, status line, settings globaux Claude Code.

### `/worktree-monitor:set`

Sélectionne le worktree actif quand plusieurs existent. Sauvegarde le choix dans `.claude/.worktree-monitor-root` (gitignored).

### `/worktree-monitor:widgets`

Configure interactivement les widgets de la status line. Propose des presets avec preview ASCII, ou une sélection widget par widget. Met à jour la clé `widgets` dans `~/.claude/worktree-monitor.json`.

## Développement

```bash
pnpm install
pnpm build    # Bundle TypeScript → dist/index.js
pnpm test     # 29 tests (node:test + tsx)
```

## Licence

MIT
