import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCsharpJsRegExpPatternAndFlags,
} from "../dist/source/csharp-source-semantics/surfaces/js/regexp/validation.js";

test("RegExp static validation accepts only the proven ECMAScript-compatible subset", () => {
  for (const [pattern, flags] of [
    ["abc", "gimsy"],
    ["a.b", "s"],
    ["(?:ab)+", ""],
    ["a(?=b)", ""],
    ["[A-Z]+|\\d+", ""],
  ]) {
    assert.deepEqual(validateCsharpJsRegExpPatternAndFlags(pattern, flags), { kind: "valid" });
  }
});

test("RegExp static validation rejects unsupported ECMAScript and .NET-only features", () => {
  for (const [pattern, flags, message] of [
    ["abc", "d", /hasIndices/],
    ["abc", "u", /Unicode-mode/],
    ["abc", "v", /Unicode-sets/],
    ["(?<name>a)", "", /Named capture/],
    ["(?<=a)b", "", /Lookbehind/],
    ["\\p{Letter}", "", /Unicode property/],
    ["(a)\\1", "", /Numeric backreferences/],
    ["(?>a)", "", /atomic groups/],
    ["(?i:a)", "", /inline option/],
  ]) {
    const result = validateCsharpJsRegExpPatternAndFlags(pattern, flags);
    assert.equal(result.kind, "unsupported");
    assert.match(result.message, message);
  }
});

test("RegExp static validation rejects invalid pattern and flag syntax", () => {
  for (const [pattern, flags, message] of [
    ["abc", "gg", /Duplicate/],
    ["abc", "q", /Invalid/],
    ["[abc", "", /Unterminated/],
    ["\\", "", /incomplete escape/],
    ["(?", "", /Incomplete/],
  ]) {
    const result = validateCsharpJsRegExpPatternAndFlags(pattern, flags);
    assert.equal(result.kind, "syntax-error");
    assert.match(result.message, message);
  }
});
