import { describe, it } from "node:test";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";

const PLUGIN_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DIST = `${PLUGIN_ROOT}/dist/index.js`;

function runStatusLine(input: object): string {
  return execSync(
    `echo '${JSON.stringify(input)}' | node ${DIST}`,
    { encoding: "utf-8", cwd: PLUGIN_ROOT, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
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
