#!/usr/bin/env node

// scripts/statusline.ts
import { execFileSync } from "node:child_process";
import { readFileSync, readSync } from "node:fs";
import { basename } from "node:path";

// scripts/types.ts
var DEFAULT_CONFIG = {
  hooks: {
    sessionStart: true,
    preToolUse: false,
    postToolUse: false
  },
  widgets: ["worktree", "model", "context"]
};

// scripts/utils/colors.ts
var ESC = "\x1B[";
var RESET = `${ESC}0m`;
function fg256(code, text) {
  return `${ESC}38;5;${code}m${text}${RESET}`;
}
function dim(text) {
  return `${ESC}2m${text}${RESET}`;
}
var pastelGreen = 114;
var pastelCyan = 117;
var pastelYellow = 228;
var pastelPurple = 183;
function colorize(color, text) {
  return fg256(color, text);
}

// scripts/utils/formatters.ts
function formatTokens(tokens) {
  if (tokens >= 1e6) {
    const m = tokens / 1e6;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokens >= 1e3) {
    const k = tokens / 1e3;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return `${tokens}`;
}
function shortenModelName(displayName) {
  const match = displayName.match(/(Opus|Sonnet|Haiku)\s*([\d.]*)/);
  if (match) {
    const family = match[1];
    const version = match[2];
    return version ? `${family} ${version}` : family;
  }
  const parts = displayName.split(/\s+/);
  return parts[parts.length - 1] ?? displayName;
}

// scripts/statusline.ts
var CONFIG_PATH = `${process.env.HOME}/.claude/worktree-monitor.json`;
var SEPARATOR = dim(" \u2502 ");
function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(4096);
  try {
    let bytesRead;
    do {
      bytesRead = readSync(0, buf, 0, buf.length, null);
      if (bytesRead > 0) chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    } while (bytesRead > 0);
  } catch {
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return JSON.parse(raw);
}
function loadConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}
function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: 3e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}
function detectWorktree(cwd) {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return null;
  const branch = git(["branch", "--show-current"], cwd) || "detached";
  const worktreeListRaw = git(["worktree", "list", "--porcelain"], cwd);
  let isWorktree = false;
  if (worktreeListRaw) {
    const entries = worktreeListRaw.split("\n\n").filter(Boolean);
    if (entries.length > 1) {
      const mainLine = entries[0]?.split("\n")[0] ?? "";
      const mainRoot = mainLine.replace("worktree ", "");
      isWorktree = root !== mainRoot;
    }
  }
  return {
    root,
    branch,
    name: basename(root),
    isWorktree
  };
}
function renderWorktreeWidget(wt) {
  const icon = wt.isWorktree ? "\u{1F333}" : "\u{1F4C1}";
  const name = colorize(pastelGreen, wt.name);
  const branch = colorize(pastelCyan, `[${wt.branch}]`);
  return `${icon} ${name} ${branch}`;
}
function renderModelWidget(input) {
  const short = shortenModelName(input.model.display_name);
  return `\u{1F916} ${colorize(pastelPurple, short)}`;
}
function renderContextWidget(input) {
  const ctx = input.context_window;
  const usage = ctx.current_usage;
  const usedTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const pctText = colorize(pastelYellow, `${Math.round(ctx.used_percentage)}%`);
  const tokens = dim(
    `${formatTokens(usedTokens)}/${formatTokens(ctx.context_window_size)}`
  );
  return `${pctText} ${tokens}`;
}
var WIDGET_RENDERERS = {
  worktree: (_input, wt) => wt ? renderWorktreeWidget(wt) : null,
  model: (input) => renderModelWidget(input),
  context: (input) => renderContextWidget(input)
};
function main() {
  try {
    const input = readStdin();
    const config = loadConfig();
    const wt = detectWorktree(input.workspace.current_dir);
    const parts = [];
    for (const widgetId of config.widgets) {
      const renderer = WIDGET_RENDERERS[widgetId];
      if (!renderer) continue;
      try {
        const result = renderer(input, wt);
        if (result) parts.push(result);
      } catch {
      }
    }
    if (parts.length > 0) {
      console.log(parts.join(SEPARATOR));
    }
  } catch {
  }
}
main();
