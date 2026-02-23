import { after, describe, it } from "node:test";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const PLUGIN_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const CHECK_SH = `${PLUGIN_ROOT}/hooks/check.sh`;

// For out-of-worktree tests, we need a CWD that IS a git repo so the
// fallback "git rev-parse --show-toplevel" works. We create a temp git repo.
const tempDirs: Array<string> = [];

function setupTempGitRepo(): string {
  const dir = execSync("mktemp -d", { encoding: "utf-8" }).trim();
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git commit --allow-empty -m init", { cwd: dir, stdio: "pipe" });
  tempDirs.push(dir);
  return dir;
}

function setupTempGitRepoWithWorktrees(): { main: string; secondary: string } {
  const mainRaw = setupTempGitRepo();
  const secondaryRaw = execSync("mktemp -d", { encoding: "utf-8" }).trim();
  // Remove the dir so git worktree add can create it
  rmSync(secondaryRaw, { recursive: true, force: true });
  execSync(`git worktree add "${secondaryRaw}" -b test-branch`, { cwd: mainRaw, stdio: "pipe" });
  tempDirs.push(secondaryRaw);
  // Resolve real paths for git consistency (macOS /var → /private/var symlink)
  const main = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", cwd: mainRaw }).trim();
  const secondary = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", cwd: secondaryRaw }).trim();
  return { main, secondary };
}

function writePermissionsFile(worktreeRoot: string, permissions: Record<string, string>): void {
  const dir = `${worktreeRoot}/.claude`;
  mkdirSync(dir, { recursive: true });
  const filePath = `${dir}/.worktree-monitor-permissions`;
  writeFileSync(filePath, JSON.stringify(permissions));
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runCheck(input: object, mode = "pre", cwd?: string): { stdout: string; exitCode: number } {
  const json = JSON.stringify(input);
  try {
    const stdout = execSync(
      `printf '%s' ${JSON.stringify(json)} | WORKTREE_MONITOR_MODE=${mode} bash ${CHECK_SH}`,
      { encoding: "utf-8", cwd: cwd ?? PLUGIN_ROOT, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string };
    return { stdout: (e.stdout ?? "").trim(), exitCode: e.status };
  }
}

describe("check.sh", () => {
  describe("allowlist", () => {
    it("allows /tmp paths", () => {
      const result = runCheck({ tool_name: "Read", tool_input: { file_path: "/tmp/test.txt" } });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
    });

    it("allows ~/.claude paths", () => {
      const home = process.env.HOME;
      const result = runCheck({ tool_name: "Write", tool_input: { file_path: `${home}/.claude/settings.json` } });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
    });

    it("allows /dev paths", () => {
      const result = runCheck({ tool_name: "Read", tool_input: { file_path: "/dev/null" } });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
    });
  });

  describe("unknown tools", () => {
    it("lets unknown tools through", () => {
      const result = runCheck({ tool_name: "Bash", tool_input: { command: "ls" } });
      assert.equal(result.exitCode, 0);
    });
  });

  describe("missing path", () => {
    it("lets through when no file_path in input", () => {
      const result = runCheck({ tool_name: "Read", tool_input: {} });
      assert.equal(result.exitCode, 0);
    });
  });

  describe("path extraction per tool", () => {
    it("extracts file_path for Read", () => {
      const result = runCheck({ tool_name: "Read", tool_input: { file_path: PLUGIN_ROOT + "/package.json" } });
      assert.equal(result.exitCode, 0);
    });

    it("extracts file_path for MultiEdit", () => {
      const result = runCheck({ tool_name: "MultiEdit", tool_input: { file_path: "/tmp/multi.ts" } });
      assert.equal(result.exitCode, 0); // /tmp is allowlisted
    });

    it("extracts path for Glob", () => {
      const result = runCheck({ tool_name: "Glob", tool_input: { path: "/tmp" } });
      assert.equal(result.exitCode, 0);
    });

    it("extracts path for Grep", () => {
      const result = runCheck({ tool_name: "Grep", tool_input: { path: "/tmp", pattern: "foo" } });
      assert.equal(result.exitCode, 0);
    });
  });

  describe("non-git and different-repo paths (auto-accept)", () => {
    it("auto-accepts paths not in any git repo", () => {
      const gitCwd = setupTempGitRepo();
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: "/Users/nobody/random-project/file.txt" } },
        "pre",
        gitCwd
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
    });

    it("auto-accepts paths in a different git repo", () => {
      const repoA = setupTempGitRepo();
      const repoB = setupTempGitRepo();
      // Create a file in repoB so the path exists
      writeFileSync(`${repoB}/file.txt`, "hello");
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: `${repoB}/file.txt` } },
        "pre",
        repoA
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
    });
  });

  describe("same-repo cross-worktree access", () => {
    it("blocks access when no permission is recorded", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
      assert.ok(result.stdout.includes("accès inter-worktree"));
    });

    it("allows Read with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("allows Glob with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "Glob", tool_input: { path: secondary } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("allows Grep with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "Grep", tool_input: { path: secondary, pattern: "foo" } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("blocks Write with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "Write", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
      assert.ok(result.stdout.includes("readonly"));
    });

    it("blocks Edit with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "Edit", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
    });

    it("allows Write with readwrite permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readwrite" });
      const result = runCheck(
        { tool_name: "Write", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("allows Edit with readwrite permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readwrite" });
      const result = runCheck(
        { tool_name: "Edit", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("blocks MultiEdit with readonly permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readonly" });
      const result = runCheck(
        { tool_name: "MultiEdit", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
    });

    it("allows MultiEdit with readwrite permission", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      writePermissionsFile(main, { [secondary]: "readwrite" });
      const result = runCheck(
        { tool_name: "MultiEdit", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      assert.equal(result.exitCode, 0);
    });

    it("blocks when permissions file is corrupted JSON (no fail-open)", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      mkdirSync(`${main}/.claude`, { recursive: true });
      writeFileSync(`${main}/.claude/.worktree-monitor-permissions`, "NOT VALID JSON{{{");
      const result = runCheck(
        { tool_name: "Write", tool_input: { file_path: `${secondary}/file.txt` } },
        "pre",
        main
      );
      // Corrupted file → PERMISSION is empty → falls through to block (no permission)
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
    });

    it("warns but allows in post mode (no permission)", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: `${secondary}/file.txt` } },
        "post",
        main
      );
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes("Worktree Monitor"));
      assert.ok(result.stdout.includes("autre worktree"));
    });

    it("handles paths whose parent dir does not exist yet", () => {
      const { main, secondary } = setupTempGitRepoWithWorktrees();
      // Path with non-existent intermediate directory
      const result = runCheck(
        { tool_name: "Write", tool_input: { file_path: `${secondary}/newdir/subdir/file.txt` } },
        "pre",
        main
      );
      // Should still detect as same-repo cross-worktree and block (no permission)
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
    });
  });

  describe("empty/malformed input", () => {
    it("exits cleanly on empty tool_name", () => {
      const result = runCheck({ tool_name: "", tool_input: {} });
      assert.equal(result.exitCode, 0);
    });
  });
});
