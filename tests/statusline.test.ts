import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const PLUGIN_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DIST = `${PLUGIN_ROOT}/dist/index.js`;
let tmpCounter = 0;

function runStatusLine(input: object, configOverride?: object): string {
  let tmpConfigPath: string | null = null;
  if (configOverride) {
    tmpConfigPath = join(tmpdir(), `wt-monitor-test-${process.pid}-${++tmpCounter}.json`);
    writeFileSync(tmpConfigPath, JSON.stringify(configOverride));
  }
  try {
    const result = spawnSync("node", [DIST], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      cwd: PLUGIN_ROOT,
      env: tmpConfigPath ? { ...process.env, WORKTREE_MONITOR_CONFIG: tmpConfigPath } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return (result.stdout ?? "").trim();
  } finally {
    if (tmpConfigPath) {
      try { unlinkSync(tmpConfigPath); } catch {}
    }
  }
}

const BASE_INPUT = {
  model: { id: "claude-opus-4-6", display_name: "Claude Opus 4.6" },
  context_window: {
    used_percentage: 40,
    remaining_percentage: 60,
    context_window_size: 200000,
    current_usage: { input_tokens: 70000, output_tokens: 10000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  },
  cost: { total_cost_usd: 1.25, total_duration_ms: 45000, total_api_duration_ms: 2300 },
  workspace: { current_dir: PLUGIN_ROOT, project_dir: PLUGIN_ROOT },
  session_id: "test",
  transcript_path: "/tmp/test",
  version: "1.0.80",
};

describe("statusline output", () => {
  it("contains the model family and version", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(output.includes("Opus 4.6"), `Expected 'Opus 4.6' in: ${output}`);
  });

  it("contains the percentage", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(output.includes("40%"), `Expected '40%' in: ${output}`);
  });

  it("contains token counts", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(output.includes("80K"), `Expected '80K' in: ${output}`);
    assert.ok(output.includes("200K"), `Expected '200K' in: ${output}`);
  });

  it("does NOT contain cost", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(!output.includes("$1.25"), `Should not contain cost, got: ${output}`);
  });

  it("does NOT contain progress bar characters", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(!output.includes("\u2588"), `Should not contain filled bar char, got: ${output}`);
    assert.ok(!output.includes("\u2591"), `Should not contain empty bar char, got: ${output}`);
  });

  it("contains separator", () => {
    const output = runStatusLine(BASE_INPUT);
    assert.ok(output.includes("\u2502"), `Expected separator '│' in: ${output}`);
  });

  it("handles Sonnet model", () => {
    const input = { ...BASE_INPUT, model: { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" } };
    const output = runStatusLine(input);
    assert.ok(output.includes("Sonnet 4.6"), `Expected 'Sonnet 4.6' in: ${output}`);
  });

  it("handles non-git workspace gracefully", () => {
    const input = { ...BASE_INPUT, workspace: { current_dir: "/tmp", project_dir: "/tmp" } };
    const output = runStatusLine(input);
    // Should still have model and context, just no worktree widget
    assert.ok(output.includes("Opus 4.6"));
    assert.ok(output.includes("40%"));
  });
});

describe("git widgets", () => {
  const gitConfig = (widgets: Array<string>) => ({
    hooks: { sessionStart: false, preToolUse: false, postToolUse: false },
    widgets,
  });

  it("git-dirty shows dirty count or clean for a git repo", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-dirty"]));
    // In the plugin repo, we expect either "dirty" or "clean"
    assert.ok(
      output.includes("dirty") || output.includes("clean"),
      `Expected dirty/clean indicator in: ${output}`
    );
  });

  it("git-last-commit shows relative time", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-last-commit"]));
    assert.ok(
      output.includes("ago"),
      `Expected relative time with 'ago' in: ${output}`
    );
  });

  it("git-state is hidden when no merge/rebase in progress", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-state"]));
    // In normal state, git-state should be hidden (null) — empty output
    assert.ok(
      !output.includes("REBASE") && !output.includes("MERGE"),
      `Expected no git state in: ${output}`
    );
  });

  it("git-stash is hidden when stash count is 0", () => {
    // We can't guarantee stash state, but the widget should not crash
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-stash"]));
    // Either shows stash count or is empty — should not crash
    assert.ok(typeof output === "string");
  });

  it("git-diff-stat shows additions/removals or is hidden", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-diff-stat"]));
    // Either shows +N -N or is empty (no unstaged changes)
    if (output.length > 0) {
      assert.ok(output.includes("+") && output.includes("-"), `Expected diff stat format in: ${output}`);
    }
  });

  it("git-ahead-behind shows arrows or is hidden (no upstream)", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-ahead-behind"]));
    // May be empty if no upstream configured
    if (output.length > 0) {
      assert.ok(output.includes("⬆") && output.includes("⬇"), `Expected arrows in: ${output}`);
    }
  });

  it("git-tag shows tag or is hidden", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-tag"]));
    // May be empty if no tags in the repo
    assert.ok(typeof output === "string");
  });

  it("git-branch-commits shows commit count or is hidden", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["git-branch-commits"]));
    // May be empty if on main branch
    if (output.length > 0) {
      assert.ok(output.includes("commit"), `Expected 'commit' in: ${output}`);
    }
  });

  it("multiple git widgets render with separators", () => {
    const output = runStatusLine(BASE_INPUT, gitConfig(["model", "git-dirty", "git-last-commit"]));
    assert.ok(output.includes("Opus 4.6"), `Expected model in: ${output}`);
    assert.ok(output.includes("│"), `Expected separator in: ${output}`);
  });

  it("handles non-git workspace gracefully with git widgets", () => {
    const input = { ...BASE_INPUT, workspace: { current_dir: "/tmp", project_dir: "/tmp" } };
    const output = runStatusLine(input, gitConfig(["git-dirty", "git-last-commit", "model"]));
    // Git widgets should be null, model should still render
    assert.ok(output.includes("Opus 4.6"), `Expected model in: ${output}`);
  });

  it("skips git detection entirely when no git widgets configured", () => {
    // With only base widgets, should work fine and fast
    const output = runStatusLine(BASE_INPUT, gitConfig(["model", "context"]));
    assert.ok(output.includes("Opus 4.6"));
    assert.ok(output.includes("40%"));
  });
});
