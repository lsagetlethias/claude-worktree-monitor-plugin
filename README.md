# worktree-monitor

Plugin Claude Code pour le monitoring et la protection des git worktrees.

## Fonctionnalités

- **Status line** — Affiche en permanence le worktree actif, le modèle Claude, et l'utilisation du contexte
- **Hook SessionStart** — Alerte après compaction si plusieurs worktrees existent (confirmation utilisateur)
- **Hook PreToolUse** — Bloque les opérations fichier hors du worktree actif (opt-in)
- **Hook PostToolUse** — Avertissement non-bloquant pour les opérations hors worktree (opt-in)
- **Skills** — `/worktree-monitor:setup` pour configurer, `/worktree-monitor:set` pour sélectionner un worktree

## Prérequis

- Claude Code CLI
- Node.js 22+
- pnpm
- git

## Installation

```bash
# Cloner le plugin dans le dossier plugins locaux
git clone https://github.com/lsagetlethias/claude-worktree-monitor-plugin.git \
  ~/.claude/plugins/local/worktree-monitor

# Installer les dépendances et builder
cd ~/.claude/plugins/local/worktree-monitor
pnpm install
pnpm build
```

Puis lancer `/worktree-monitor:setup` dans une session Claude Code pour configurer les hooks et la status line.

## Status line

```
🌳 my-project [feat/auth] │ 🤖 Opus 4.6 │ 40% 80K/200K
```

| Widget | Description |
|---|---|
| `🌳`/`📁` | Worktree secondaire ou repo principal + branche |
| `🤖` | Modèle Claude actif (famille + version) |
| `%` | Utilisation du contexte (tokens utilisés/total) |

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

## Développement

```bash
pnpm install
pnpm build    # Bundle TypeScript → dist/index.js
pnpm test     # 29 tests (node:test + tsx)
```

## Licence

MIT
