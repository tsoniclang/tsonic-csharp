import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCsharpSourceLiteralTargetType } from "../../../dist/policy/conversions/source-literals.js";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import {
  csharpSourcePrimitiveTargetType,
  isCsharpArrayIndexTargetType,
  isCsharpIntegralTargetType,
} from "../../../dist/target-model/types/carriers/scalar-types.js";

test("pure C# source literals select exact integral and floating representations", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalValue(numericLiteral("0")),
    ),
    csharpSourcePrimitiveTargetType("int64"),
  );
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalValue(numericLiteral("0.5")),
    ),
    csharpSourcePrimitiveTargetType("float64"),
  );
});

test("every source surface shares the same exact integer default without a profile input", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalValue(numericLiteral("0")),
    ),
    csharpSourcePrimitiveTargetType("int64"),
  );
  assert.equal(resolveCsharpSourceLiteralTargetType({ target: { id: "csharp" } }, literalValue(numericLiteral("0"))), undefined,
    "the removed profile-based call signature does not select a carrier");
});

test("signed pure C# literals apply the same exact representation policy", () => {
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalValue(prefixLiteral("KindMinusToken", "1")),
    ),
    csharpSourcePrimitiveTargetType("int64"),
  );
  assert.deepEqual(
    resolveCsharpSourceLiteralTargetType(
      literalValue(prefixLiteral("KindMinusToken", "2147483649")),
    ),
    csharpSourcePrimitiveTargetType("int64"),
  );
});

test("unannotated integer zero has no sign while written or declared floating zero retains its sign", () => {
  for (const target of [{ id: "csharp" }, { id: "csharp", surfaces: ["js"] }]) {
    for (const text of ["0", "0.0", "0e100"]) {
      const negative = literalValue(prefixLiteral("KindMinusToken", text));
      assert.equal(Object.is(negative?.number, -0), true, `${text}: the checked literal retains its actual sign`);
      assert.equal(resolveCsharpSourceLiteralTargetType(negative)?.name, text === "0" ? "int64" : "float64",
        `${text}: only written floating notation asks for a signed native zero`);
      const declared = selectCsharpExactLiteralConversion(negative, csharpSourcePrimitiveTargetType("float64"));
      assert.equal(declared.kind === "resolved" && declared.recipe.kind === "signed-zero", true,
        `${text}: an actual declared floating destination still retains the negative sign`);
    }
    const positive = literalValue(numericLiteral("0"));
    assert.equal(resolveCsharpSourceLiteralTargetType(positive)?.name,
      "int64", `${target.surfaces?.[0] ?? "native"}: positive zero keeps the common int64 default`);
  }
});

test("authored integer tokens retain int64 beyond double and int32 precision", () => {
  for (const text of ["1", "2147483648", "9007199254740993", "9223372036854775807", "0xffff", "0b1010"]) {
    const literal = literalValue(numericLiteral(text));
    const carrier = resolveCsharpSourceLiteralTargetType(literal);
    assert.equal(carrier?.kind === "source-primitive" && carrier.name === "int64", true, text);
    assert.equal(selectCsharpExactLiteralConversion(literal, carrier).kind, "resolved", `${text}: exact native integer conversion`);
  }
  const minimum = literalValue(prefixLiteral("KindMinusToken", "9223372036854775808"));
  const carrier = resolveCsharpSourceLiteralTargetType(minimum);
  assert.equal(carrier?.name, "int64");
  assert.equal(selectCsharpExactLiteralConversion(minimum, carrier).kind, "resolved", "signed native minimum stays exact");
});

test("an unannotated out-of-int64 token rejects instead of widening to float", () => {
  for (const node of [numericLiteral("9223372036854775808"), prefixLiteral("KindMinusToken", "9223372036854775809")]) {
    const literal = literalValue(node);
    const carrier = resolveCsharpSourceLiteralTargetType(literal);
    assert.equal(carrier?.name, "int64", "range failure cannot choose another default");
    const conversion = selectCsharpExactLiteralConversion(literal, carrier);
    assert.equal(conversion.kind === "rejected" && conversion.reason.includes("int64"), true,
      "the existing exact native range check rejects the original token");
  }
});

test("authored fractional and exponent notation requests float64 even for integral values", () => {
  for (const text of ["1.", "1.0", "1e0", "2e3", ".5", "0.5", "0.0", "0e0"]) {
    assert.equal(resolveCsharpSourceLiteralTargetType(literalValue(numericLiteral(text)))?.name, "float64", text);
  }
});

test("synthetic checked floating evidence is not fabricated authored integer syntax", () => {
  const node = numericLiteral("1");
  const literal = analyzeSourceLiteralValues({ ...literalAst, authoredRange: () => ({ kind: "synthetic" }) },
    [{ kind: "file", children: [node] }]).literalValue.get(node);
  assert.equal(literal?.numeric?.kind === "checked-float64", true);
  assert.equal(resolveCsharpSourceLiteralTargetType(literal)?.name, "float64");
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
  authoredRange: node => node.kind === "numeric"
    ? { kind: "authored", start: 0, end: node.text.length } : { kind: "synthetic" },
  getSourceFile: node => node,
  getSourceText: file => file.text,
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
