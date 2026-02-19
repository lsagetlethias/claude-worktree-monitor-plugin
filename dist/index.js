#!/usr/bin/env node

// scripts/statusline.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readSync } from "node:fs";
import { basename, join } from "node:path";

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
function boldFg256(code, text) {
  return `${ESC}1;38;5;${code}m${text}${RESET}`;
}
var pastelGreen = 114;
var pastelCyan = 117;
var pastelYellow = 228;
var pastelPurple = 183;
var pastelRed = 210;
var pastelOrange = 216;
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
function formatRelativeTime(crFormat) {
  return crFormat.replace(/\s+seconds?\s+ago/, "s ago").replace(/\s+minutes?\s+ago/, "m ago").replace(/\s+hours?\s+ago/, "h ago").replace(/\s+days?\s+ago/, "d ago").replace(/\s+weeks?\s+ago/, "w ago").replace(/\s+months?\s+ago/, "mo ago").replace(/\s+years?\s+ago/, "y ago");
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
var CONFIG_PATH = process.env.WORKTREE_MONITOR_CONFIG ?? `${process.env.HOME}/.claude/worktree-monitor.json`;
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
    wt: { root, branch, name: basename(root), isWorktree },
    worktreeListRaw
  };
}
function detectGitInfo(cwd, wt, worktreeListRaw) {
  const { root, branch } = wt;
  let aheadBehind = null;
  const abRaw = git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd);
  if (abRaw) {
    const parts = abRaw.split(/\s+/);
    if (parts.length === 2) {
      aheadBehind = { behind: parseInt(parts[0], 10), ahead: parseInt(parts[1], 10) };
    }
  }
  const porcelain = git(["status", "--porcelain"], cwd);
  const dirtyCount = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;
  let diffStat = null;
  const shortstat = git(["diff", "--shortstat"], cwd);
  if (shortstat) {
    const addMatch = shortstat.match(/(\d+) insertion/);
    const delMatch = shortstat.match(/(\d+) deletion/);
    diffStat = {
      added: addMatch ? parseInt(addMatch[1], 10) : 0,
      removed: delMatch ? parseInt(delMatch[1], 10) : 0
    };
  }
  const stashRaw = git(["stash", "list"], cwd);
  const stashCount = stashRaw ? stashRaw.split("\n").filter(Boolean).length : 0;
  const lastCommitAge = git(["log", "-1", "--format=%cr"], cwd) || null;
  let branchCommits = null;
  const defaultBranch = git(["rev-parse", "--verify", "--quiet", "main"], cwd) ? "main" : git(["rev-parse", "--verify", "--quiet", "master"], cwd) ? "master" : null;
  if (defaultBranch && branch !== defaultBranch) {
    const countRaw = git(["rev-list", "--count", `${defaultBranch}..HEAD`], cwd);
    if (countRaw) branchCommits = parseInt(countRaw, 10);
  }
  const gitDir = git(["rev-parse", "--git-dir"], cwd);
  let state = null;
  if (gitDir) {
    const absGitDir = gitDir.startsWith("/") ? gitDir : join(cwd, gitDir);
    if (existsSync(join(absGitDir, "REBASE_HEAD")) || existsSync(join(absGitDir, "rebase-merge")) || existsSync(join(absGitDir, "rebase-apply"))) {
      state = "REBASE";
    } else if (existsSync(join(absGitDir, "MERGE_HEAD"))) {
      state = "MERGE";
    } else if (existsSync(join(absGitDir, "CHERRY_PICK_HEAD"))) {
      state = "CHERRY-PICK";
    } else if (existsSync(join(absGitDir, "REVERT_HEAD"))) {
      state = "REVERT";
    }
  }
  const tag = git(["describe", "--tags"], cwd) || null;
  const worktrees = [];
  if (worktreeListRaw) {
    const entries = worktreeListRaw.split("\n\n").filter(Boolean);
    for (const entry of entries.slice(0, 5)) {
      const lines = entry.split("\n");
      const wtPath = lines[0]?.replace("worktree ", "") ?? "";
      const branchLine = lines.find((l) => l.startsWith("branch "));
      const wtBranch = branchLine ? branchLine.replace("branch refs/heads/", "") : "detached";
      const wtPorcelain = git(["status", "--porcelain"], wtPath);
      const dirty = wtPorcelain.length > 0;
      worktrees.push({ path: wtPath, branch: wtBranch, dirty });
    }
  }
  return {
    root,
    branch,
    aheadBehind,
    dirtyCount,
    diffStat,
    stashCount,
    lastCommitAge,
    branchCommits,
    state,
    tag,
    worktrees
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
function renderGitAheadBehind(info) {
  if (!info.aheadBehind) return null;
  const { ahead, behind } = info.aheadBehind;
  return `${colorize(pastelGreen, `\u2B06${ahead}`)} ${colorize(pastelRed, `\u2B07${behind}`)}`;
}
function renderGitDirty(info) {
  if (info.dirtyCount > 0) {
    return colorize(pastelOrange, `\u270F\uFE0F ${info.dirtyCount} dirty`);
  }
  return colorize(pastelGreen, "\u270F\uFE0F clean");
}
function renderGitDiffStat(info) {
  if (!info.diffStat) return null;
  const { added, removed } = info.diffStat;
  return `${colorize(pastelGreen, `+${added}`)} ${colorize(pastelRed, `-${removed}`)}`;
}
function renderGitStash(info) {
  if (info.stashCount === 0) return null;
  return colorize(pastelPurple, `\u{1F4E6} ${info.stashCount} stash`);
}
function renderGitLastCommit(info) {
  if (!info.lastCommitAge) return null;
  return dim(`\u{1F550} ${formatRelativeTime(info.lastCommitAge)}`);
}
function renderGitBranchCommits(info) {
  if (info.branchCommits === null || info.branchCommits === 0) return null;
  return colorize(pastelCyan, `\u{1F500} ${info.branchCommits} commit${info.branchCommits > 1 ? "s" : ""}`);
}
function renderGitState(info) {
  if (!info.state) return null;
  return boldFg256(pastelRed, `\u26A0\uFE0F ${info.state}`);
}
function renderGitTag(info) {
  if (!info.tag) return null;
  return colorize(pastelYellow, `\u{1F3F7} ${info.tag}`);
}
function renderWtCount(info) {
  if (info.worktrees.length <= 1) return null;
  return colorize(pastelGreen, `\u{1F333} ${info.worktrees.length} wt`);
}
function renderWtDirty(info) {
  if (info.worktrees.length <= 1) return null;
  const clean = info.worktrees.filter((w) => !w.dirty).length;
  const total = info.worktrees.length;
  const color = clean === total ? pastelGreen : pastelOrange;
  return colorize(color, `\u{1F333} ${clean}/${total} clean`);
}
function renderWtBranches(info) {
  if (info.worktrees.length <= 1) return null;
  const branches = info.worktrees.map((w) => w.branch).join("\u2502");
  return colorize(pastelCyan, `\u{1F333} ${branches}`);
}
var WIDGET_RENDERERS = {
  worktree: (_input, wt) => wt ? renderWorktreeWidget(wt) : null,
  model: (input) => renderModelWidget(input),
  context: (input) => renderContextWidget(input),
  "git-ahead-behind": (_input, _wt, gi) => gi ? renderGitAheadBehind(gi) : null,
  "git-dirty": (_input, _wt, gi) => gi ? renderGitDirty(gi) : null,
  "git-diff-stat": (_input, _wt, gi) => gi ? renderGitDiffStat(gi) : null,
  "git-stash": (_input, _wt, gi) => gi ? renderGitStash(gi) : null,
  "git-last-commit": (_input, _wt, gi) => gi ? renderGitLastCommit(gi) : null,
  "git-branch-commits": (_input, _wt, gi) => gi ? renderGitBranchCommits(gi) : null,
  "git-state": (_input, _wt, gi) => gi ? renderGitState(gi) : null,
  "git-tag": (_input, _wt, gi) => gi ? renderGitTag(gi) : null,
  "wt-count": (_input, _wt, gi) => gi ? renderWtCount(gi) : null,
  "wt-dirty": (_input, _wt, gi) => gi ? renderWtDirty(gi) : null,
  "wt-branches": (_input, _wt, gi) => gi ? renderWtBranches(gi) : null
};
function main() {
  try {
    const input = readStdin();
    const config = loadConfig();
    const cwd = input.workspace.current_dir;
    const detected = detectWorktree(cwd);
    const wt = detected?.wt ?? null;
    const needsGitInfo = detected && config.widgets.some(
      (w) => w.startsWith("git-") || w.startsWith("wt-")
    );
    const gitInfo = needsGitInfo ? detectGitInfo(cwd, detected.wt, detected.worktreeListRaw) : null;
    const parts = [];
    for (const widgetId of config.widgets) {
      const renderer = WIDGET_RENDERERS[widgetId];
      if (!renderer) continue;
      try {
        const result = renderer(input, wt, gitInfo);
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
