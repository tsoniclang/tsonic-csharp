import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
  csharpPostfixUnaryOperatorTokenFromText,
  csharpPrefixUnaryOperatorTokenFromText,
} from "../../../../dist/backend/target-ast/syntax/operator-tokens.js";

test("binary operator text maps to exactly one Roslyn token kind", () => {
  for (const [text, kind] of [
    ["&&", "AmpersandAmpersandToken"], ["||", "BarBarToken"], ["??", "QuestionQuestionToken"],
    ["==", "EqualsEqualsToken"], ["!=", "ExclamationEqualsToken"], ["<=", "LessThanEqualsToken"],
    [">>>", "GreaterThanGreaterThanGreaterThanToken"], ["%", "PercentToken"],
  ]) assert.deepEqual(csharpBinaryOperatorTokenFromText(text), { kind }, text);
  for (const text of ["===", "!==", "**", "in", "instanceof", "=", "toString", ""]) {
    assert.equal(csharpBinaryOperatorTokenFromText(text), undefined, text);
  }
});

test("assignment operator text maps to its compound Roslyn token kind", () => {
  for (const [text, kind] of [
    ["=", "EqualsToken"], ["??=", "QuestionQuestionEqualsToken"], ["+=", "PlusEqualsToken"],
    [">>>=", "GreaterThanGreaterThanGreaterThanEqualsToken"], ["^=", "CaretEqualsToken"],
  ]) assert.deepEqual(csharpAssignmentOperatorTokenFromText(text), { kind }, text);
  for (const text of ["**=", "&&=", "||=", "==", "constructor"]) {
    assert.equal(csharpAssignmentOperatorTokenFromText(text), undefined, text);
  }
});

test("prefix and postfix unary tokens are distinct closed sets", () => {
  for (const [text, kind] of [["+", "PlusToken"], ["-", "MinusToken"], ["~", "TildeToken"], ["!", "ExclamationToken"],
    ["++", "PlusPlusToken"], ["--", "MinusMinusToken"]]) {
    assert.deepEqual(csharpPrefixUnaryOperatorTokenFromText(text), { kind }, text);
  }
  assert.equal(csharpPrefixUnaryOperatorTokenFromText("typeof"), undefined);
  assert.deepEqual(csharpPostfixUnaryOperatorTokenFromText("++"), { kind: "PlusPlusToken" });
  assert.deepEqual(csharpPostfixUnaryOperatorTokenFromText("--"), { kind: "MinusMinusToken" });
  for (const text of ["+", "!", "~"]) assert.equal(csharpPostfixUnaryOperatorTokenFromText(text), undefined, text);
});

test("native syntax modules are syntax-only: they import no analysis, policy, planner or source owner", () => {
  const directory = new URL("../../../../src/backend/target-ast/syntax", import.meta.url);
  for (const name of readdirSync(directory).filter(file => file.endsWith(".ts"))) {
    const text = readFileSync(new URL(name, directory), "utf8");
    for (const match of text.matchAll(/from\s+"([^"]+)"/gu)) {
      assert.doesNotMatch(match[1], /\/(?:analysis|policy|planner|source|providers)\//u, `${name}: ${match[1]}`);
    }
  }
});
