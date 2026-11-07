import assert from "node:assert/strict";
import test from "node:test";
import { csharpBigIntegerTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";

import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { selectCsharpNumericBinaryPromotion } from "../../../dist/policy/operations/numeric/promotion.js";

// nextgen C-2542: the policy reads literal values from the Host publication facts.values.literal (the literal index is
// no longer public). Every literal operand is a real checked literal (checkedSourceLiteralValues); a node without a
// registered literal is a nonliteral value.
const authoredLiterals = new WeakMap();
const input = { facts: { values: { literal: (node) => authoredLiterals.get(node) } } };
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

test("C# numeric promotion honors an exact enclosing result type only for representable operands", () => {
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      numericLiteral("7"),
      primitive("float64"),
      numericLiteral("2"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("int32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      numericLiteral("1.5"),
      primitive("float64"),
      numericLiteral("2.5"),
      primitive("float64"),
      primitive("float32"),
    ),
    promoted("float32"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      numericLiteral("7"),
      primitive("float64"),
      numericLiteral("2.5"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("float64"),
  );
  assert.deepEqual(
    selectCsharpNumericBinaryPromotion(
      input,
      value,
      primitive("float64"),
      numericLiteral("2"),
      primitive("float64"),
      primitive("int32"),
    ),
    promoted("float64"),
  );
});

test("C# native integer operands retain exact bigint literal bounds", () => {
  for (const [name, text] of [["uint64", "9007199254740993"], ["uint64", "18446744073709551615"], ["int64", "9223372036854775807"]]) {
    assert.deepEqual(selectCsharpNumericBinaryPromotion(input, value, primitive(name),
      bigintLiteral(`${text}n`), csharpBigIntegerTargetType()), promoted(name));
  }
  for (const [name, text] of [["uint64", "18446744073709551616"], ["int64", "9223372036854775808"]]) {
    assert.equal(selectCsharpNumericBinaryPromotion(input, value, primitive(name),
      bigintLiteral(`${text}n`), csharpBigIntegerTargetType()), undefined);
  }
});

test("C# exact arithmetic contexts select native carriers before broad bigint classification", () => {
  const literal = bigintLiteral;
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
  const node = { kind: "numeric", kindName: "KindNumericLiteral", text };
  authoredLiterals.set(node, checkedSourceLiteralValues([text])[0]);
  return node;
}

function bigintLiteral(text) {
  const node = { kind: "bigint", kindName: "KindBigIntLiteral", text };
  authoredLiterals.set(node, checkedSourceLiteralValues([text])[0]);
  return node;
}
