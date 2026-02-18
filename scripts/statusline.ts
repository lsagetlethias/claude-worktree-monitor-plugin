import { execFileSync } from "node:child_process";
import { readFileSync, readSync } from "node:fs";
import { basename } from "node:path";

import type { Config, StdinInput, WidgetId, WorktreeInfo } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { colorize, dim, pastelCyan, pastelGreen, pastelPurple, pastelYellow } from "./utils/colors.js";
import { formatTokens, shortenModelName } from "./utils/formatters.js";

const CONFIG_PATH = `${process.env.HOME}/.claude/worktree-monitor.json`;
const SEPARATOR = dim(" \u2502 "); // │

// --- stdin reading ---

function readStdin(): StdinInput {
  const chunks: Array<Buffer> = [];
  const buf = Buffer.alloc(4096);

  try {
    let bytesRead: number;
    do {
      bytesRead = readSync(0, buf, 0, buf.length, null);
      if (bytesRead > 0) chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    } while (bytesRead > 0);
  } catch {
    // EAGAIN or EOF — done reading
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return JSON.parse(raw) as StdinInput;
}

// --- config loading ---

function loadConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// --- worktree detection ---

function git(args: Array<string>, cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function detectWorktree(cwd: string): WorktreeInfo | null {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return null;

  const branch = git(["branch", "--show-current"], cwd) || "detached";
  const worktreeListRaw = git(["worktree", "list", "--porcelain"], cwd);

  // Detect if current root is a secondary worktree
  let isWorktree = false;
  if (worktreeListRaw) {
    const entries = worktreeListRaw.split("\n\n").filter(Boolean);
    if (entries.length > 1) {
      // First entry is the main worktree; if our root isn't it, we're secondary
      const mainLine = entries[0]?.split("\n")[0] ?? "";
      const mainRoot = mainLine.replace("worktree ", "");
      isWorktree = root !== mainRoot;
    }
  }

  return {
    root,
    branch,
    name: basename(root),
    isWorktree,
  };
}

// --- widget renderers ---

function renderWorktreeWidget(wt: WorktreeInfo): string {
  const icon = wt.isWorktree ? "\uD83C\uDF33" : "\uD83D\uDCC1"; // 🌳 or 📁
  const name = colorize(pastelGreen, wt.name);
  const branch = colorize(pastelCyan, `[${wt.branch}]`);
  return `${icon} ${name} ${branch}`;
}

function renderModelWidget(input: StdinInput): string {
  const short = shortenModelName(input.model.display_name);
  return `\uD83E\uDD16 ${colorize(pastelPurple, short)}`; // 🤖
}

function renderContextWidget(input: StdinInput): string {
  const pctText = colorize(pastelYellow, `${Math.round(input.context.percentage)}%`);
  const tokens = dim(
    `${formatTokens(input.context.used_tokens)}/${formatTokens(input.context.total_tokens)}`
  );
  return `${pctText} ${tokens}`;
}

const WIDGET_RENDERERS: Record<WidgetId, (input: StdinInput, wt: WorktreeInfo | null) => string | null> = {
  worktree: (_input, wt) => (wt ? renderWorktreeWidget(wt) : null),
  model: (input) => renderModelWidget(input),
  context: (input) => renderContextWidget(input),
};

// --- main ---

function main(): void {
  try {
    const input = readStdin();
    const config = loadConfig();
    const wt = detectWorktree(input.workspace.current_dir);

    const parts: Array<string> = [];
    for (const widgetId of config.widgets) {
      const renderer = WIDGET_RENDERERS[widgetId];
      if (!renderer) continue;
      const result = renderer(input, wt);
      if (result) parts.push(result);
    }

    if (parts.length > 0) {
      console.log(parts.join(SEPARATOR));
    }
  } catch {
    // Silent failure — status line should never crash Claude Code
  }
}

main();
