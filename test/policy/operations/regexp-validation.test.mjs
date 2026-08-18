import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCsharpJsRegExpPatternAndFlags,
} from "../../../dist/policy/operations/index.js";

test("RegExp policy accepts only the proven ECMAScript-compatible subset", () => {
  for (const [pattern, flags] of [
    ["abc", "gimsy"],
    ["a.b", "s"],
    ["(?:ab)+", ""],
    ["a(?=b)", ""],
    ["[A-Z]+|\\d+", ""],
  ]) {
    assert.deepEqual(validateCsharpJsRegExpPatternAndFlags(pattern, flags), {
      kind: "valid",
    });
  }
});

test("RegExp policy rejects unsupported ECMAScript and .NET-only features", () => {
  for (const [pattern, flags, message] of [
    ["abc", "d", /hasIndices/u],
    ["abc", "u", /Unicode-mode/u],
    ["abc", "v", /Unicode-sets/u],
    ["(?<name>a)", "", /Named capture/u],
    ["(?<=a)b", "", /Lookbehind/u],
    ["\\p{Letter}", "", /Unicode property/u],
    ["(a)\\1", "", /Numeric backreferences/u],
    ["(?>a)", "", /atomic groups/u],
    ["(?i:a)", "", /inline option/u],
  ]) {
    const result = validateCsharpJsRegExpPatternAndFlags(pattern, flags);
    assert.equal(result.kind, "unsupported");
    assert.match(result.message, message);
  }
});

test("RegExp policy rejects invalid pattern and flag syntax", () => {
  for (const [pattern, flags, message] of [
    ["abc", "gg", /Duplicate/u],
    ["abc", "q", /Invalid/u],
    ["[abc", "", /Unterminated/u],
    ["\\", "", /incomplete escape/u],
    ["(?", "", /Incomplete/u],
  ]) {
    const result = validateCsharpJsRegExpPatternAndFlags(pattern, flags);
    assert.equal(result.kind, "syntax-error");
    assert.match(result.message, message);
  }
});
