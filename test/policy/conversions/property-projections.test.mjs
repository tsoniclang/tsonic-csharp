import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpPropertyValueProjection } from "../../../dist/backend/planner/expressions/property-value-projection.js";
import { resolveCsharpObjectShapePropertyOrder } from "../../../dist/target-model/types/object-shape-projection.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/index.js";
import { requireObjectShapeProjection } from "../../../dist/backend/planner/artifacts/graph/object-shapes/requests.js";
import { selectCsharpPropertyProjections } from "../../../dist/analysis/conversions/property-projections.js";

function fixture() {
  const source = { kind: "target-named", id: "Options", csharpSourceDeclarationKind: "class" };
  const count = { sourceKey: { kind: "property", name: "count" }, sourceName: "count", targetName: "storedCount",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64"), optional: true };
  const grouping = { sourceKey: { kind: "property", name: "useGrouping" }, sourceName: "useGrouping", targetName: "grouping",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("bool"), accessor: { getter: true, setter: false } };
  const method = { sourceKey: { kind: "property", name: "toJSON" }, sourceName: "toJSON", targetName: "jsonMethod",
    memberKind: "method", type: csharpStringTargetType() };
  const shape = { targetType: source, members: [count, method, grouping] };
  const members = Object.freeze([count, grouping]);
  const conversions = [];
  const input = { program: { source: { ast: { pos: () => 1 } }, conversions: {
    propertyProjection: () => members,
    select(type) { conversions.push(type); return { kind: "js-value-box" }; },
  } }, types: { objectShapes: { resolveTarget: () => shape } }, scope: {},
    names: { temporaryName: value => value },
    artifacts: { requireObjectShapeProjection() { assert.fail("native options are not a generic class capability"); } },
  };
  return { source, shape, members, input, conversions };
}

test("native selected properties use exact instantiated fields at the call site, not generic type helpers", () => {
  const current = fixture();
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "supply" }, arguments: [] };
  const diagnostics = [];
  const selected = planCsharpPropertyValueProjection({}, {}, current.input, diagnostics, current.source, expression);
  assert.equal(diagnostics.length, 0);
  assert.equal(selected?.kind, "SwitchExpression");
  assert.equal(selected.expression === expression, true, "the supplier is evaluated exactly once");
  assert.equal(selected.arms.length, 1);
  assert.equal(current.conversions.length, 2);
  assert.equal(current.conversions[0] === current.members[0].type && current.conversions[1] === current.members[1].type, true,
    "exact integer and selected getter carriers are not replaced");
  assert.deepEqual(selected.arms[0].expression.arguments.filter((_, index) => index % 2 === 0).map(value => value.expression.value),
    ["count", "useGrouping"]);
  assert.equal(resolveCsharpObjectShapePropertyOrder(current.shape, undefined, "keys", {}).kind, "rejected",
    "selected consumption does not weaken enumerable own-set proof");
});

test("native property projection rejects missing sealed demand and the removed generic helper path", () => {
  const current = fixture();
  current.input.program.conversions.propertyProjection = () => undefined;
  const diagnostics = [];
  assert.equal(planCsharpPropertyValueProjection({}, {}, current.input, diagnostics, current.source,
    { kind: "IdentifierName", name: "value" }) === undefined, true, "missing evidence rejects");
  assert.equal(diagnostics.length, 1);
  assert.equal(requireObjectShapeProjection({}, undefined, current.source, {}, "properties", csharpStringTargetType(),
    "object-shape").kind, "rejected", "the superseded generic class helper is not retained");
});

test("native dictionary slots need no nominal field projection and unrelated carriers still reject", () => {
  const destination = {};
  const policy = { semanticsFor: () => ({ types: { nonNullableType: type => type } }) };
  const dictionary = { kind: "target-named", id: "NativeDictionary", csharpCollectionSurface: "record",
    typeArguments: [csharpStringTargetType(), csharpTsValueTargetType()] };
  const exact = selectCsharpPropertyProjections({}, dictionary, destination, policy, {
    resolveTarget() { assert.fail("dictionary properties already belong to the native dictionary"); },
  });
  assert.deepEqual(exact, []);
  assert.equal(Object.isFrozen(exact), true);
  for (const source of [undefined, { kind: "target-named", id: "NativeDictionary" },
    { ...dictionary, csharpCollectionSurface: "array" }, { ...dictionary, typeArguments: undefined },
    { ...dictionary, typeArguments: [csharpSourcePrimitiveTargetType("uint64"), csharpTsValueTargetType()] },
    { ...dictionary, typeArguments: [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64")] }]) {
    const rejected = selectCsharpPropertyProjections({}, source, destination, policy, { resolveTarget: () => undefined });
    assert.equal(rejected === undefined, true, "the exact string-key/closed-value dictionary admission is mandatory");
  }
});
