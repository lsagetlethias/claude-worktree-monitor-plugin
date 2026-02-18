import { after, describe, it } from "node:test";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
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

  describe("out-of-worktree blocking", () => {
    it("blocks reads to non-existent paths outside worktree in pre mode", () => {
      const gitCwd = setupTempGitRepo();
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: "/Users/nobody/evil-project/secrets.txt" } },
        "pre",
        gitCwd
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stdout.includes('"decision":"block"'));
    });

    it("warns but allows in post mode", () => {
      const gitCwd = setupTempGitRepo();
      const result = runCheck(
        { tool_name: "Read", tool_input: { file_path: "/Users/nobody/evil-project/secrets.txt" } },
        "post",
        gitCwd
      );
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes("Worktree Monitor"));
    });
  });

  describe("empty/malformed input", () => {
    it("exits cleanly on empty tool_name", () => {
      const result = runCheck({ tool_name: "", tool_input: {} });
      assert.equal(result.exitCode, 0);
    });
  });
});
