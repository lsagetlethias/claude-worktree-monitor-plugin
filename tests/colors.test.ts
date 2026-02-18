import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { colorize, dim, fg256 } from "../scripts/utils/colors.js";

describe("fg256", () => {
  it("wraps text with ANSI 256-color codes", () => {
    const result = fg256(114, "hello");
    assert.equal(result, "\x1b[38;5;114mhello\x1b[0m");
  });
});

describe("dim", () => {
  it("wraps text with dim ANSI code", () => {
    const result = dim("faded");
    assert.equal(result, "\x1b[2mfaded\x1b[0m");
  });
});

describe("colorize", () => {
  it("is an alias for fg256", () => {
    assert.equal(colorize(111, "test"), fg256(111, "test"));
  });
});
