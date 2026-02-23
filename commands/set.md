---
name: set
description: Set the active worktree for the current project — lists worktrees and saves choice
allowed-tools: Read, Write, Bash(git:*), AskUserQuestion
---

# Worktree Monitor — Set Active Worktree

Change le worktree actif pour le projet courant.

## Étapes

### 1. Détecter les worktrees disponibles

Exécuter `git worktree list` pour lister tous les worktrees.

Si un seul worktree est détecté :
- Informer l'utilisateur qu'il n'y a qu'un seul worktree
- Aucune action nécessaire, terminer

### 2. Demander confirmation à l'utilisateur

Utiliser `AskUserQuestion` pour présenter les worktrees disponibles.

Formatter les options avec le chemin et la branche, par exemple :
- `kokatsuna [dev]` — repo principal
- `kokatsuna-auth-2fa [feat/auth-2fa]`
- `kokatsuna-email-dsfr [feat/email-dsfr]`

Extraire les infos depuis la sortie de `git worktree list` :
- Colonne 1 : chemin absolu
- Colonne 3 : branche (entre crochets)
- Utiliser `basename` du chemin comme nom court

### 3. Sauvegarder le choix

Écrire le chemin absolu du worktree sélectionné dans :
```
{project}/.claude/.worktree-monitor-root
```

Où `{project}` est le résultat de `git rev-parse --show-toplevel` (la racine du worktree actuel).

Ce fichier est lu par le hook `check.sh` pour déterminer la root attendue.

**Note** : Ajouter `.claude/.worktree-monitor-root` au `.gitignore` du projet si ce n'est pas déjà fait.

### 4. Appliquer le contexte

Une fois le worktree confirmé par l'utilisateur :
- Notifier que le répertoire sélectionné est maintenant le worktree actif
- Rappeler la branche active
- Indiquer que TOUS les chemins absolus doivent pointer vers ce répertoire
- Ne JAMAIS toucher aux fichiers d'un autre worktree

### 5. Permissions inter-worktree

Si l'utilisateur accède à un fichier dans un autre worktree du même repo, le hook `check.sh` demandera un niveau d'accès.

Les permissions sont stockées dans :
```
{project}/.claude/.worktree-monitor-permissions
```

Format JSON : `{ "/chemin/worktree": "readonly" | "readwrite" }`

Ce fichier est géré automatiquement par le hook PreToolUse qui guide Claude pour demander la permission à l'utilisateur.

**Note** : Ajouter `.claude/.worktree-monitor-permissions` au `.gitignore` du projet si ce n'est pas déjà fait.

### 6. Résumé

Afficher un résumé :
- Worktree confirmé : chemin absolu + branche
- Fichier pin : chemin du `.worktree-monitor-root`
- Rappel : tous les chemins utiliseront ce répertoire pour les opérations fichier
