import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpTypeParameterConstraintKey,
  csharpTypeParameterConstraintOrder,
  csharpTypeParameterConstraintsEqual,
  csharpTypeParameterConstraintsImply,
  selectCsharpNativeTypeParameterConstraint,
  selectCsharpExplicitImplementationConstraints,
} from "../../../dist/policy/constraints/type-parameter-constraints.js";
import { isCsharpNonNullableValueType } from "../../../dist/policy/constraints/native-types.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { renderCsharpExplicitImplementationTypeParameters } from "../../../dist/backend/planner/types/type-parameters.js";

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

test("dependent constraints preserve subtype and notnull evidence without inheriting native primaries", () => {
  const source = [{ kind: "type", type: parameter }];
  for (const inherited of ["class", "struct", "unmanaged"]) {
    const bounds = new Map([[parameter.identity, [keyword(inherited), { kind: "constructor" }]]]);
    for (const required of ["class", "struct", "unmanaged"]) {
      assert.equal(csharpTypeParameterConstraintsImply({}, source, [keyword(required)], bounds), false,
        `${inherited}: a dependent binder has no declared ${required} primary`);
    }
    assert.equal(csharpTypeParameterConstraintsImply({}, source, [{ kind: "constructor" }], bounds), false,
      `${inherited}: constructing the bound does not prove construction of every subtype`);
    assert.equal(csharpTypeParameterConstraintsImply({}, source, [keyword("notnull")], bounds), true,
      `${inherited}: the native non-null constraint remains inherited`);
  }
  const concrete = csharpTargetNamedType("Example.Base", [], undefined,
    { allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: true });
  assert.equal(csharpTypeParameterConstraintsImply({}, source, [keyword("class")],
    new Map([[parameter.identity, [{ kind: "type", type: concrete }]]])), true,
  "a concrete class bound still proves every actual is a reference");
  assert.equal(csharpTypeParameterConstraintsImply({}, source, [keyword("class")], new Map()), false,
    "an unresolved bound is not evidence");
});

test("explicit method primaries are sealed by implemented binder position and nullable signature", () => {
  const base = csharpTargetNamedType("Example.Base", [], undefined,
    { allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: true });
  const outer = { ...parameter, csharpConstraints: { kind: "resolved", constraints: [keyword("class")] } };
  const definitions = [
    ["direct", [keyword("class")]], ["value", [keyword("struct")]], ["unmanaged", [keyword("unmanaged")]],
    ["dependent", [{ kind: "type", type: outer }]], ["base", [{ kind: "type", type: base }]],
    ["unconstrained", []], ["nonnullable", [keyword("class")]],
  ].map(([identity, constraints]) => ({ identity, constraints }));
  const signature = definitions.slice(0, -1).map(definition => ({
    kind: "type-parameter", identity: definition.identity, name: "Destination", csharpNullableReference: true,
  }));
  const selected = selectCsharpExplicitImplementationConstraints(definitions, signature);
  const expected = ["class", undefined, undefined, "default", "class", "default", undefined];
  assert.equal(Object.isFrozen(selected), true, "the producer publishes immutable per-binder data");
  for (let index = 0; index < expected.length; index += 1) {
    assert.equal(selected[index], expected[index], `${definitions[index].identity}: exact native primary`);
  }
  const names = definitions.map((_, index) => `Renamed${index}`);
  const rendered = renderCsharpExplicitImplementationTypeParameters(names, selected);
  for (let index = 0; index < names.length; index += 1) {
    assert.equal(rendered[index].name, names[index], "implementing spelling never decides the native clause");
    assert.equal(rendered[index].constraints?.[0]?.keyword, expected[index], `${names[index]}: sealed clause rendered unchanged`);
    assert.equal(rendered[index].constraints?.length ?? 0, expected[index] === undefined ? 0 : 1,
      "inherited full where clauses are never repeated");
  }
  assert.throws(() => renderCsharpExplicitImplementationTypeParameters(names.slice(1), selected),
    error => String(error.message).includes("one sealed native primary constraint"),
    "the renderer refuses inconsistent sealed binder cardinality rather than guessing");
});
