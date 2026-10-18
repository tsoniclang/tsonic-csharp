import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { csharpBigIntegerTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";

import {
  csharpSourcePrimitiveTargetType,
  selectCsharpNumericBinaryPromotion,
} from "../../../dist/policy/index.js";

const ast = {
  is: {
    IsArrayLiteralExpression: (node) => node.kind === "array",
    IsBinaryExpression: (node) => node.kind === "binary",
    IsBigIntLiteral: (node) => node.kind === "bigint",
    IsNoSubstitutionTemplateLiteral: (node) => node.kind === "template",
    IsNumericLiteral: (node) => node.kind === "numeric",
    IsParenthesizedExpression: (node) => node.kind === "parenthesized",
    IsPrefixUnaryExpression: (node) => node.kind === "prefix",
    IsStringLiteral: (node) => node.kind === "string",
  },
  as: {
    AsParenthesizedExpression: (node) => node,
    AsPrefixUnaryExpression: (node) => node,
  },
  elements: (node) => node.elements ?? [],
  forEachChild: (node, visit) => [...(node.children ?? []), ...(node.Operand === undefined ? [] : [node.Operand]),
    ...(node.elements ?? [])].forEach(visit),
  kindName: (node) => node.kindName,
  authoredRange: () => ({ kind: "synthetic" }),
  operatorKindName: (node) => node.operator,
  text: (node) => node.text,
};

const input = { literalValues: { literalValue: { get: (node) =>
  analyzeSourceLiteralValues(ast, [{ kind: "file", children: [node] }]).literalValue.get(node) } } };
const value = { kind: "value" };

test("C# numeric promotion follows exact predefined target arithmetic", () => {
  assertPromotion("int8", "int8", "int32");
  assertPromotion("uint32", "int32", "int64");
  assertPromotion("float32", "int64", "float32");
  assertPromotion("native-int", "native-int", "native-int");
  assertPromotion("int128", "int128", "int128");
  assertNoPromotion("uint64", "int64");
  assertNoPromotion("decimal", "float64");
  assertNoPromotion("native-int", "int32");
  assertNoPromotion("int128", "int64");
});

test("C# numeric promotion uses exact representable literal evidence", () => {
  const { input: actualInput, literal: actualNumericLiteral } = checkedNumericLiterals();
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      value,
      primitive("int32"),
      actualNumericLiteral("2"),
      primitive("float64"),
    ),
    promoted("int32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      value,
      primitive("float32"),
      actualNumericLiteral("1.5"),
      primitive("float64"),
    ),
    promoted("float32"),
  );
});

test("C# numeric promotion honors an exact enclosing result type only for representable operands", () => {
  const { input: actualInput, literal: actualNumericLiteral } = checkedNumericLiterals();
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      actualNumericLiteral("7"),
      primitive("float64"),
      actualNumericLiteral("2"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("int32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      actualNumericLiteral("1.5"),
      primitive("float64"),
      actualNumericLiteral("2.5"),
      primitive("float64"),
      primitive("float32"),
    ),
    promoted("float32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      actualNumericLiteral("7"),
      primitive("float64"),
      actualNumericLiteral("2.5"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("float64"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      actualInput,
      value,
      primitive("float64"),
      actualNumericLiteral("2"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("float64"),
  );
});

test("C# native integer operands retain exact bigint literal bounds", () => {
  for (const [name, text] of [["uint64", "9007199254740993"], ["uint64", "18446744073709551615"], ["int64", "9223372036854775807"]]) {
    assert.deepEqual(selectCsharpNumericBinaryPromotion(input, value, primitive(name),
      { kind: "bigint", kindName: "KindBigIntLiteral", text: `${text}n` }, csharpBigIntegerTargetType()), promoted(name));
  }
  for (const [name, text] of [["uint64", "18446744073709551616"], ["int64", "9223372036854775808"]]) {
    assert.equal(selectCsharpNumericBinaryPromotion(input, value, primitive(name),
      { kind: "bigint", kindName: "KindBigIntLiteral", text: `${text}n` }, csharpBigIntegerTargetType()), undefined);
  }
});

test("C# exact arithmetic contexts select native carriers before broad bigint classification", () => {
  const literal = text => ({ kind: "bigint", kindName: "KindBigIntLiteral", text });
  for (const name of ["int64", "uint64", "native-int", "native-uint"]) {
    assert.deepEqual(selectCsharpNumericBinaryPromotion(input, literal("64n"), csharpBigIntegerTargetType(),
      literal("1024n"), csharpBigIntegerTargetType(), primitive(name)), promoted(name));
  }
  assert.deepEqual(selectCsharpNumericBinaryPromotion(input, numericLiteral("7"), primitive("float64"),
    numericLiteral("2"), primitive("float64"), primitive("uint8")), promoted("int32"));
  assert.equal(selectCsharpNumericBinaryPromotion(input, literal("18446744073709551616n"), csharpBigIntegerTargetType(),
    literal("1n"), csharpBigIntegerTargetType(), primitive("uint64")), undefined);
  assert.equal(selectCsharpNumericBinaryPromotion(input, value, csharpBigIntegerTargetType(),
    literal("1n"), csharpBigIntegerTargetType(), primitive("uint64")), undefined);
});

function assertPromotion(left, right, result) {
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      value,
      primitive(left),
      value,
      primitive(right),
    ),
    promoted(result),
  );
}

function assertNoPromotion(left, right) {
  assert.equal(
    selectCsharpNumericBinaryPromotion(
      input,
      value,
      primitive(left),
      value,
      primitive(right),
    ),
    undefined,
  );
}

function promoted(name) {
  const type = primitive(name);
  return { leftType: type, rightType: type, resultType: type };
}

function primitive(name) {
  return csharpSourcePrimitiveTargetType(name);
}

function numericLiteral(text) {
  return { kind: "numeric", kindName: "KindNumericLiteral", text };
}

function checkedNumericLiterals() {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": "export const values = [2, 1.5, 7, 2.5];" },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const literals = analyzeSourceLiteralValues(source.ast, source.navigation.sourceFiles);
  const nodes = new Map();
  const visit = node => {
    if (source.ast.is.IsNumericLiteral(node)) nodes.set(source.ast.text(node), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  return {
    input: { literalValues: literals },
    literal(text) {
      const node = nodes.get(text);
      assert.equal(node !== undefined && literals.literalValue.get(node)?.numeric?.kind === "authored", true,
        `${text}: native precision evidence comes from the original checked source token`);
      return node;
    },
  };
}
