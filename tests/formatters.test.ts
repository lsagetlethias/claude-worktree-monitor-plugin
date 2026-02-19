import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatRelativeTime, formatTokens, shortenModelName } from "../scripts/utils/formatters.js";

describe("formatTokens", () => {
  it("formats small numbers as-is", () => {
    assert.equal(formatTokens(0), "0");
    assert.equal(formatTokens(500), "500");
    assert.equal(formatTokens(999), "999");
  });

  it("formats thousands with K suffix", () => {
    assert.equal(formatTokens(1000), "1K");
    assert.equal(formatTokens(1500), "1.5K");
    assert.equal(formatTokens(80000), "80K");
    assert.equal(formatTokens(150000), "150K");
    assert.equal(formatTokens(999999), "1000.0K");
  });

  it("formats millions with M suffix", () => {
    assert.equal(formatTokens(1_000_000), "1M");
    assert.equal(formatTokens(2_500_000), "2.5M");
  });
});

describe("shortenModelName", () => {
  it("extracts family + version from Claude display names", () => {
    assert.equal(shortenModelName("Claude Opus 4.6"), "Opus 4.6");
    assert.equal(shortenModelName("Claude Sonnet 4.6"), "Sonnet 4.6");
    assert.equal(shortenModelName("Claude Haiku 4.5"), "Haiku 4.5");
  });

  it("handles family without version", () => {
    assert.equal(shortenModelName("Claude Opus"), "Opus");
    assert.equal(shortenModelName("Sonnet"), "Sonnet");
  });

  it("falls back to last word for unknown models", () => {
    assert.equal(shortenModelName("GPT-4o"), "GPT-4o");
    assert.equal(shortenModelName("Some Unknown Model"), "Model");
  });
});

describe("formatRelativeTime", () => {
  it("shortens common time units", () => {
    assert.equal(formatRelativeTime("2 hours ago"), "2h ago");
    assert.equal(formatRelativeTime("1 hour ago"), "1h ago");
    assert.equal(formatRelativeTime("5 minutes ago"), "5m ago");
    assert.equal(formatRelativeTime("1 minute ago"), "1m ago");
    assert.equal(formatRelativeTime("30 seconds ago"), "30s ago");
    assert.equal(formatRelativeTime("3 days ago"), "3d ago");
    assert.equal(formatRelativeTime("1 day ago"), "1d ago");
    assert.equal(formatRelativeTime("2 weeks ago"), "2w ago");
    assert.equal(formatRelativeTime("6 months ago"), "6mo ago");
    assert.equal(formatRelativeTime("1 year ago"), "1y ago");
  });

  it("passes through unknown formats", () => {
    assert.equal(formatRelativeTime("just now"), "just now");
  });
});
