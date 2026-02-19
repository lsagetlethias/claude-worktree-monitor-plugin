import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { boldFg256, colorize, dim, fg256 } from "../scripts/utils/colors.js";

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

describe("boldFg256", () => {
  it("combines bold and 256-color in a single escape sequence", () => {
    const result = boldFg256(210, "alert");
    assert.equal(result, "\x1b[1;38;5;210malert\x1b[0m");
  });

  it("does not produce nested RESET like bold(fg256(...))", () => {
    const result = boldFg256(210, "test");
    // Should contain exactly one RESET at the end
    const resets = result.match(/\x1b\[0m/g);
    assert.equal(resets?.length, 1);
  });
});
