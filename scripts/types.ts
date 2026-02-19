/**
 * Schema for Claude Code status line stdin JSON.
 * Mirrors the actual payload from Claude Code.
 */
export interface StdinInput {
  model: {
    id: string;
    display_name: string;
  };
  context_window: {
    used_percentage: number;
    remaining_percentage: number;
    context_window_size: number;
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
  };
  workspace: {
    current_dir: string;
    project_dir: string;
  };
  session_id: string;
  transcript_path: string;
  version: string;
}

export type WidgetId =
  | "worktree"
  | "model"
  | "context"
  | "git-ahead-behind"
  | "git-dirty"
  | "git-diff-stat"
  | "git-stash"
  | "git-last-commit"
  | "git-branch-commits"
  | "git-state"
  | "git-tag"
  | "wt-count"
  | "wt-dirty"
  | "wt-branches";

export interface Config {
  hooks: {
    sessionStart: boolean;
    preToolUse: boolean;
    postToolUse: boolean;
  };
  widgets: Array<WidgetId>;
}

export interface WorktreeInfo {
  root: string;
  branch: string;
  name: string;
  isWorktree: boolean;
}

export interface GitInfo {
  root: string;
  branch: string;
  aheadBehind: { ahead: number; behind: number } | null;
  dirtyCount: number;
  diffStat: { added: number; removed: number } | null;
  stashCount: number;
  lastCommitAge: string | null;
  branchCommits: number | null;
  state: "MERGE" | "REBASE" | "CHERRY-PICK" | "REVERT" | null;
  tag: string | null;
  worktrees: Array<{ path: string; branch: string; dirty: boolean }>;
}

export const DEFAULT_CONFIG: Config = {
  hooks: {
    sessionStart: true,
    preToolUse: false,
    postToolUse: false,
  },
  widgets: ["worktree", "model", "context"],
};
