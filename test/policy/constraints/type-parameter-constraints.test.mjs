import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpTypeParameterConstraintKey,
  csharpTypeParameterConstraintOrder,
  csharpTypeParameterConstraintsEqual,
  csharpTypeParameterConstraintsImply,
  selectCsharpNativeTypeParameterConstraint,
} from "../../../dist/policy/constraints/type-parameter-constraints.js";
import { isCsharpNonNullableValueType } from "../../../dist/policy/constraints/native-types.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

const parameter = Object.freeze({ kind: "type-parameter", identity: "owner:Box:T", name: "T" });
const widget = csharpTargetNamedType("Acme.Widget", [], undefined, { allowsRefLikeTypeArguments: [] });
const keyword = (name) => ({ kind: "keyword", keyword: name });

test("a source constraint selects one exact native C# generic constraint or an unsupported value", () => {
  assert.deepEqual(selectCsharpNativeTypeParameterConstraint(undefined, parameter, true, false),
    { kind: "resolved", constraints: [keyword("class")] });
  const numeric = selectCsharpNativeTypeParameterConstraint(undefined, parameter, false, true);
  assert.equal(numeric.kind, "resolved");
  assert.equal(numeric.constraints.length, 1);
  assert.equal(numeric.constraints[0].kind, "type");
  assert.equal(numeric.constraints[0].type.id, "System.Numerics.INumber`1");
  assert.deepEqual(numeric.constraints[0].type.typeArguments, [parameter]);
  assert.deepEqual(selectCsharpNativeTypeParameterConstraint(widget, parameter, false, false),
    { kind: "resolved", constraints: [{ kind: "type", type: widget }] });
  const other = Object.freeze({ kind: "type-parameter", identity: "owner:Box:U", name: "U" });
  assert.deepEqual(selectCsharpNativeTypeParameterConstraint(other, parameter, false, false),
    { kind: "resolved", constraints: [{ kind: "type", type: other }] });
  for (const unrepresentable of [undefined, csharpStringTargetType(), csharpSourcePrimitiveTargetType("int32")]) {
    assert.equal(selectCsharpNativeTypeParameterConstraint(unrepresentable, parameter, false, false).kind, "unsupported");
  }
});

test("constraint identity is order-free and ordered keyword, type, constructor for emission", () => {
  assert.equal(csharpTypeParameterConstraintKey(keyword("struct")), "keyword:struct");
  assert.equal(csharpTypeParameterConstraintKey({ kind: "constructor" }), "constructor");
  assert.equal(csharpTypeParameterConstraintsEqual([keyword("class"), { kind: "constructor" }],
    [{ kind: "constructor" }, keyword("class")]), true);
  assert.equal(csharpTypeParameterConstraintsEqual([keyword("class")], [keyword("struct")]), false);
  assert.deepEqual([{ kind: "constructor" }, { kind: "type", type: widget }, keyword("notnull")]
    .map(csharpTypeParameterConstraintOrder), [2, 1, 0]);
});

test("keyword constraints imply exactly what the C# compiler accepts", () => {
  const imply = (source, required) => csharpTypeParameterConstraintsImply({}, source, required, new Map());
  assert.equal(imply([keyword("unmanaged")], [keyword("struct")]), true);
  assert.equal(imply([keyword("struct")], [keyword("unmanaged")]), false);
  assert.equal(imply([keyword("class")], [keyword("notnull")]), true);
  assert.equal(imply([keyword("struct")], [{ kind: "constructor" }]), true);
  assert.equal(imply([keyword("class")], [{ kind: "constructor" }]), false);
  assert.equal(imply([], [keyword("class")]), false);
  assert.equal(imply([keyword("notnull")], []), true);
});

test("a non-nullable native value type is a value carrier without a nullable wrapper", () => {
  assert.equal(isCsharpNonNullableValueType(csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(isCsharpNonNullableValueType(csharpStringTargetType()), false);
  assert.equal(isCsharpNonNullableValueType(widget), false);
});
