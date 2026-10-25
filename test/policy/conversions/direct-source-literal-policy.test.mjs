import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCsharpSourceLiteralTargetType } from "../../../dist/policy/conversions/source-literals.js";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
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

test("checked negative zero remains a floating native value on every surface", () => {
  for (const target of [{ id: "csharp" }, { id: "csharp", surfaces: ["js"] }]) {
    for (const text of ["0", "0.0", "0e100"]) {
      const negative = literalValue(prefixLiteral("KindMinusToken", text));
      assert.equal(Object.is(negative?.number, -0), true, `${text}: the checked literal retains its actual sign`);
      assert.equal(resolveCsharpSourceLiteralTargetType(literalPolicyHost(target), negative)?.name, "float64",
        `${text}: integer storage cannot preserve negative zero`);
    }
    const positive = literalValue(numericLiteral("0"));
    assert.equal(resolveCsharpSourceLiteralTargetType(literalPolicyHost(target), positive)?.name,
      target.surfaces === undefined ? "int32" : "float64", "positive zero keeps the selected surface's exact native default");
  }
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
  return analyzeSourceLiteralValues(literalAst, [{ kind: "file", children: [node] }]).literalValue.get(node);
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
