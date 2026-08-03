import assert from "node:assert/strict";
import test from "node:test";

import {
  csharpSourcePrimitiveTargetType,
  selectCsharpNumericBinaryPromotion,
} from "../dist/policy/index.js";

const ast = {
  is: {
    IsArrayLiteralExpression: (node) => node.kind === "array",
    IsBigIntLiteral: (node) => node.kind === "bigint",
    IsNoSubstitutionTemplateLiteral: (node) => node.kind === "template",
    IsNumericLiteral: (node) => node.kind === "numeric",
    IsPrefixUnaryExpression: (node) => node.kind === "prefix",
    IsStringLiteral: (node) => node.kind === "string",
  },
  as: {
    AsPrefixUnaryExpression: (node) => node,
  },
  elements: (node) => node.elements ?? [],
  kindName: (node) => node.kindName,
  operatorKindName: (node) => node.operator,
  text: (node) => node.text,
};

const input = { ast };
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
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      value,
      primitive("int32"),
      numericLiteral("2"),
      primitive("float64"),
    ),
    promoted("int32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      value,
      primitive("float32"),
      numericLiteral("1.5"),
      primitive("float64"),
    ),
    promoted("float32"),
  );
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
  return { kind: "numeric", text };
}
