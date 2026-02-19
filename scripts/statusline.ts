import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readSync } from "node:fs";
import { basename, join } from "node:path";

import type { Config, GitInfo, StdinInput, WidgetId, WorktreeInfo } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { bold, colorize, dim, pastelCyan, pastelGreen, pastelOrange, pastelPurple, pastelRed, pastelYellow } from "./utils/colors.js";
import { formatRelativeTime, formatTokens, shortenModelName } from "./utils/formatters.js";

const CONFIG_PATH = process.env.WORKTREE_MONITOR_CONFIG ?? `${process.env.HOME}/.claude/worktree-monitor.json`;
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

// --- git info detection ---

function detectGitInfo(cwd: string, wt: WorktreeInfo): GitInfo | null {
  const { root, branch } = wt;

  // ahead/behind
  let aheadBehind: GitInfo["aheadBehind"] = null;
  const abRaw = git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd);
  if (abRaw) {
    const parts = abRaw.split(/\s+/);
    if (parts.length === 2) {
      aheadBehind = { behind: parseInt(parts[0]!, 10), ahead: parseInt(parts[1]!, 10) };
    }
  }

  // dirty count
  const porcelain = git(["status", "--porcelain"], cwd);
  const dirtyCount = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;

  // diff stat
  let diffStat: GitInfo["diffStat"] = null;
  const shortstat = git(["diff", "--shortstat"], cwd);
  if (shortstat) {
    const addMatch = shortstat.match(/(\d+) insertion/);
    const delMatch = shortstat.match(/(\d+) deletion/);
    diffStat = {
      added: addMatch ? parseInt(addMatch[1]!, 10) : 0,
      removed: delMatch ? parseInt(delMatch[1]!, 10) : 0,
    };
  }

  // stash count
  const stashRaw = git(["stash", "list"], cwd);
  const stashCount = stashRaw ? stashRaw.split("\n").filter(Boolean).length : 0;

  // last commit age
  const lastCommitAge = git(["log", "-1", "--format=%cr"], cwd) || null;

  // branch commits (compared to main/master)
  let branchCommits: number | null = null;
  const defaultBranch = git(["rev-parse", "--verify", "--quiet", "main"], cwd) ? "main"
    : git(["rev-parse", "--verify", "--quiet", "master"], cwd) ? "master"
    : null;
  if (defaultBranch && branch !== defaultBranch) {
    const countRaw = git(["rev-list", "--count", `${defaultBranch}..HEAD`], cwd);
    if (countRaw) branchCommits = parseInt(countRaw, 10);
  }

  // git state
  const gitDir = git(["rev-parse", "--git-dir"], cwd);
  let state: GitInfo["state"] = null;
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

  // tag
  const tag = git(["describe", "--tags"], cwd) || null;

  // worktrees
  const worktrees: GitInfo["worktrees"] = [];
  const wtListRaw = git(["worktree", "list", "--porcelain"], cwd);
  if (wtListRaw) {
    const entries = wtListRaw.split("\n\n").filter(Boolean);
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
    worktrees,
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
  const ctx = input.context_window;
  const usage = ctx.current_usage;
  const usedTokens =
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const pctText = colorize(pastelYellow, `${Math.round(ctx.used_percentage)}%`);
  const tokens = dim(
    `${formatTokens(usedTokens)}/${formatTokens(ctx.context_window_size)}`
  );
  return `${pctText} ${tokens}`;
}

// --- git widget renderers ---

function renderGitAheadBehind(info: GitInfo): string | null {
  if (!info.aheadBehind) return null;
  const { ahead, behind } = info.aheadBehind;
  return `${colorize(pastelGreen, `⬆${ahead}`)} ${colorize(pastelRed, `⬇${behind}`)}`;
}

function renderGitDirty(info: GitInfo): string | null {
  if (info.dirtyCount > 0) {
    return colorize(pastelOrange, `✏️ ${info.dirtyCount} dirty`);
  }
  return colorize(pastelGreen, "✏️ clean");
}

function renderGitDiffStat(info: GitInfo): string | null {
  if (!info.diffStat) return null;
  const { added, removed } = info.diffStat;
  return `${colorize(pastelGreen, `+${added}`)} ${colorize(pastelRed, `-${removed}`)}`;
}

function renderGitStash(info: GitInfo): string | null {
  if (info.stashCount === 0) return null;
  return colorize(pastelPurple, `📦 ${info.stashCount} stash`);
}

function renderGitLastCommit(info: GitInfo): string | null {
  if (!info.lastCommitAge) return null;
  return dim(`🕐 ${formatRelativeTime(info.lastCommitAge)}`);
}

function renderGitBranchCommits(info: GitInfo): string | null {
  if (info.branchCommits === null || info.branchCommits === 0) return null;
  return colorize(pastelCyan, `🔀 ${info.branchCommits} commit${info.branchCommits > 1 ? "s" : ""}`);
}

function renderGitState(info: GitInfo): string | null {
  if (!info.state) return null;
  return bold(colorize(pastelRed, `⚠️ ${info.state}`));
}

function renderGitTag(info: GitInfo): string | null {
  if (!info.tag) return null;
  return colorize(pastelYellow, `🏷 ${info.tag}`);
}

function renderWtCount(info: GitInfo): string | null {
  if (info.worktrees.length <= 1) return null;
  return colorize(pastelGreen, `🌳 ${info.worktrees.length} wt`);
}

function renderWtDirty(info: GitInfo): string | null {
  if (info.worktrees.length <= 1) return null;
  const clean = info.worktrees.filter((w) => !w.dirty).length;
  const total = info.worktrees.length;
  const color = clean === total ? pastelGreen : pastelOrange;
  return colorize(color, `🌳 ${clean}/${total} clean`);
}

function renderWtBranches(info: GitInfo): string | null {
  if (info.worktrees.length <= 1) return null;
  const branches = info.worktrees.map((w) => w.branch).join("│");
  return colorize(pastelCyan, `🌳 ${branches}`);
}

// --- widget registry ---

const WIDGET_RENDERERS: Record<WidgetId, (input: StdinInput, wt: WorktreeInfo | null, gi: GitInfo | null) => string | null> = {
  worktree: (_input, wt) => (wt ? renderWorktreeWidget(wt) : null),
  model: (input) => renderModelWidget(input),
  context: (input) => renderContextWidget(input),
  "git-ahead-behind": (_input, _wt, gi) => (gi ? renderGitAheadBehind(gi) : null),
  "git-dirty": (_input, _wt, gi) => (gi ? renderGitDirty(gi) : null),
  "git-diff-stat": (_input, _wt, gi) => (gi ? renderGitDiffStat(gi) : null),
  "git-stash": (_input, _wt, gi) => (gi ? renderGitStash(gi) : null),
  "git-last-commit": (_input, _wt, gi) => (gi ? renderGitLastCommit(gi) : null),
  "git-branch-commits": (_input, _wt, gi) => (gi ? renderGitBranchCommits(gi) : null),
  "git-state": (_input, _wt, gi) => (gi ? renderGitState(gi) : null),
  "git-tag": (_input, _wt, gi) => (gi ? renderGitTag(gi) : null),
  "wt-count": (_input, _wt, gi) => (gi ? renderWtCount(gi) : null),
  "wt-dirty": (_input, _wt, gi) => (gi ? renderWtDirty(gi) : null),
  "wt-branches": (_input, _wt, gi) => (gi ? renderWtBranches(gi) : null),
};

// --- main ---

function main(): void {
  try {
    const input = readStdin();
    const config = loadConfig();
    const cwd = input.workspace.current_dir;
    const wt = detectWorktree(cwd);

    // Detect git info only if any git/wt widget is configured and we're in a git repo
    const needsGitInfo = wt && config.widgets.some(
      (w) => w.startsWith("git-") || w.startsWith("wt-")
    );
    const gitInfo = needsGitInfo ? detectGitInfo(cwd, wt) : null;

    const parts: Array<string> = [];
    for (const widgetId of config.widgets) {
      const renderer = WIDGET_RENDERERS[widgetId];
      if (!renderer) continue;
      try {
        const result = renderer(input, wt, gitInfo);
        if (result) parts.push(result);
      } catch {
        // Skip broken widget — don't kill the whole status line
      }
    }

    if (parts.length > 0) {
      console.log(parts.join(SEPARATOR));
    }
  } catch {
    // Silent failure — status line should never crash Claude Code
  }
}

main();
