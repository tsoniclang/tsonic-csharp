import assert from "node:assert/strict";
import test from "node:test";
import { csharpBinaryOperationUsesExpectedResultType } from "../../../dist/policy/operations/operators/expected-result.js";

const sourceOperators = [
  "===", "==", "!==", "!=", "<", "<=", ">", ">=", "&&", "||", "??", "&", "|", "^", "<<", ">>", ">>>",
  "+", "-", "*", "**", "/", "%", "=", "+=", "-=", "*=", "**=", "/=", "%=", "&&=", "&=", "||=", "|=", "??=",
  "^=", "<<=", ">>=", ">>>=", "!", "~", "++", "--", ",", "in", "instanceof",
];
const expectedResultOperators = new Set([",", "&&", "||", "+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>", ">>>"]);

test("C# binary expected-result eligibility keeps the exact native operator set and default", () => {
  assert.equal(sourceOperators.length === 46 && new Set(sourceOperators).size === 46, true, "every source operator once");
  for (const operator of sourceOperators) {
    assert.equal(csharpBinaryOperationUsesExpectedResultType(operator) === expectedResultOperators.has(operator), true,
      `${operator}: exact eligibility`);
  }
  assert.equal(sourceOperators.filter(csharpBinaryOperationUsesExpectedResultType).length === expectedResultOperators.size, true,
    "only the fifteen expected-result operators are eligible");
});
