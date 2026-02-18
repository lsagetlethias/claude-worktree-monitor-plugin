/**
 * Schema for Claude Code status line stdin JSON.
 * Mirrors the full payload from Claude Code — fields like `cost` are present
 * in the stdin data but intentionally not rendered by any widget.
 */
export interface StdinInput {
  model: {
    display_name: string;
    api_name: string;
  };
  context: {
    used_tokens: number;
    total_tokens: number;
    percentage: number;
  };
  cost: {
    total_cost: number;
    currency: string;
  };
  workspace: {
    current_dir: string;
  };
}

export type WidgetId = "worktree" | "model" | "context";

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

export const DEFAULT_CONFIG: Config = {
  hooks: {
    sessionStart: true,
    preToolUse: false,
    postToolUse: false,
  },
  widgets: ["worktree", "model", "context"],
};
