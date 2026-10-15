import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveCsharpSourceLiteralTargetType,
} from "../../../dist/policy/types/resolution/source-literal-policy.js";
import { analyzeCsharpSourceLiteralValues } from "../../../dist/analysis/source-evidence/literal-values.js";
import {
  csharpSourcePrimitiveTargetType,
  isCsharpArrayIndexTargetType,
  isCsharpIntegralTargetType,
} from "../../../dist/target-model/types/carriers/scalar-types.js";

test("pure C# source literals select exact integral and floating representations", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalPolicyHost({ id: "csharp" }),
      literalValue(numericLiteral("0")),
    ),
    csharpSourcePrimitiveTargetType("int32"),
  );
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalPolicyHost({ id: "csharp" }),
      literalValue(numericLiteral("0.5")),
    ),
    csharpSourcePrimitiveTargetType("float64"),
  );
});

test("the explicit JS surface retains JavaScript numeric representation", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalPolicyHost({ id: "csharp", surfaces: ["js"] }),
      literalValue(numericLiteral("0")),
    ),
    csharpSourcePrimitiveTargetType("float64"),
  );
});

test("signed pure C# literals apply the same exact representation policy", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalPolicyHost({ id: "csharp" }),
      literalValue(prefixLiteral("KindMinusToken", "1")),
    ),
    csharpSourcePrimitiveTargetType("int32"),
  );
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalPolicyHost({ id: "csharp" }),
      literalValue(prefixLiteral("KindMinusToken", "2147483649")),
    ),
    csharpSourcePrimitiveTargetType("float64"),
  );
});

test("C# integral and array-index policies remain distinct", () => {
  assert.equal(
    isCsharpIntegralTargetType(csharpSourcePrimitiveTargetType("int128")),
    true,
  );
  assert.equal(
    isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int128")),
    false,
  );
  assert.equal(
    isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int32")),
    true,
  );
  assert.equal(
    isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("float64")),
    false,
  );
});

function literalPolicyHost(target) {
  return { target };
}

const literalAst = {
  is: {
    IsStringLiteral: () => false,
    IsNoSubstitutionTemplateLiteral: () => false,
    IsNumericLiteral: (node) => node.kind === "numeric",
    IsBigIntLiteral: () => false,
    IsParenthesizedExpression: (node) => node.kind === "parenthesized",
    IsPrefixUnaryExpression: (node) => node.kind === "prefix",
    IsBinaryExpression: () => false,
    IsArrayLiteralExpression: () => false,
  },
  as: {
    AsParenthesizedExpression: (node) => ({ Expression: node.expression }),
    AsPrefixUnaryExpression: (node) =>
      node.kind === "prefix"
        ? { Operand: node.operand }
        : undefined,
  },
  kindName: (node) => node.kind === "numeric" ? "KindNumericLiteral" : node.kind === "prefix" ? "KindPrefixUnaryExpression" : "KindSourceFile",
  authoredRange: () => ({ kind: "synthetic" }),
  forEachChild: (node, visit) => [...(node.children ?? []), ...(node.operand === undefined ? [] : [node.operand])].forEach(visit),
  operatorKindName: (node) => node.operator,
  text: (node) => node.text,
};

function literalValue(node) {
  return analyzeCsharpSourceLiteralValues(literalAst, [{ kind: "file", children: [node] }]).literalValue.get(node);
}

function numericLiteral(text) {
  return { kind: "numeric", text };
}

function prefixLiteral(operator, text) {
  return {
    kind: "prefix",
    operator,
    operand: numericLiteral(text),
  };
}
