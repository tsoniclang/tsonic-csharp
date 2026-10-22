import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpPropertyValueProjection } from "../../../../dist/backend/planner/expressions/property-value-projection.js";
import { createCsharpObjectShapePropertyOrderIndex } from "../../../../dist/analysis/objects/property-order.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/index.js";
import { requireObjectShapeProjection } from "../../../../dist/analysis/objects/native-demand-requests.js";
import { analyzeCsharpPropertyValueProjection } from "../../../../dist/analysis/conversions/property-value-projection.js";
import { selectCsharpClosedShapeConversion } from "../../../../dist/policy/types/objects/closed-object-shapes.js";

function fixture() {
  const source = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Options", csharpSourceDeclarationKind: "class" };
  const count = { sourceKey: { kind: "property", name: "count" }, sourceName: "count", targetName: "storedCount",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64"), optional: true };
  const grouping = { sourceKey: { kind: "property", name: "useGrouping" }, sourceName: "useGrouping", targetName: "grouping",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("bool"), accessor: { getter: true, setter: false } };
  const method = { sourceKey: { kind: "property", name: "toJSON" }, sourceName: "toJSON", targetName: "jsonMethod",
    memberKind: "method", type: csharpStringTargetType() };
  const shape = { targetType: source, members: [count, method, grouping] };
  const members = Object.freeze([count, grouping]);
  const node = {};
  // The conversion analysis classifies each selected member carrier to the JS value (conversions/requirements.ts);
  // the property-value analysis seals the projection the planner renders.
  const projected = Object.freeze(members.map(member => Object.freeze({ member,
    conversion: selectCsharpClosedShapeConversion({ kind: "js-value-box" }, csharpTsValueTargetType()).value })));
  const analyze = demand => analyzeCsharpPropertyValueProjection({ propertyProjectionRoots: [{ node, carrier: source }],
    propertyProjection: { get: (subject, carrier) => subject === node && carrier === source ? demand : undefined } },
  { resolveTarget: () => shape }, undefined);
  const analysis = analyze(projected);
  const input = { program: { source: { ast: { pos: () => 1 } },
    records: { propertyValueProjection: analysis.records.propertyValueProjection } }, scope: {},
    names: { temporaryName: value => value },
    artifacts: Object.freeze({}),
  };
  const orders = createCsharpObjectShapePropertyOrderIndex({}, () => {}, () => [],
    () => { throw new Error("This nominal fixture has no native implementers to query"); });
  orders.record(shape);
  orders.seal();
  return { node, source, shape, members, input, analysis, analyze, orders };
}

test("native selected properties use exact instantiated fields at the call site, not generic type helpers", () => {
  const current = fixture();
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "supply" }, arguments: [] };
  const diagnostics = [];
  assert.deepEqual(current.analysis.issues, []);
  const selected = planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, current.source, expression);
  assert.equal(diagnostics.length, 0);
  assert.equal(selected?.kind, "SwitchExpression");
  assert.equal(selected.expression === expression, true, "the supplier is evaluated exactly once");
  assert.equal(selected.arms.length, 1);
  assert.deepEqual(selected.arms[0].expression.arguments.filter((_, index) => index % 2 === 1)
    .map(value => value.expression.arguments[0].expression.name), ["storedCount", "grouping"],
  "each selected member is read from its exact instantiated field and boxed once");
  assert.deepEqual(selected.arms[0].expression.arguments.filter((_, index) => index % 2 === 0).map(value => value.expression.value),
    ["count", "useGrouping"]);
  assert.equal(current.orders.propertyOrder(current.shape, undefined, "keys").kind, "rejected",
    "selected consumption does not weaken enumerable own-set proof");
});

test("native property projection rejects missing sealed demand and the removed generic helper path", () => {
  const current = fixture();
  const missing = current.analyze(undefined);
  assert.deepEqual(missing.issues.map(issue => issue.message), ["Native property projection requires its sealed selected-parameter member demand."],
    "missing evidence rejects in the analysis");
  current.input.program.records.propertyValueProjection = missing.records.propertyValueProjection;
  const diagnostics = [];
  assert.throws(() => planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, current.source,
    { kind: "IdentifierName", name: "value" }), error => error instanceof Error && error.phase === "planning" &&
    error.message === "An admitted property projection requires its exact native representation.",
  "the planner never plans an unsealed projection");
  assert.equal(diagnostics.length, 0);
  assert.equal(requireObjectShapeProjection({}, undefined, current.source, {}, "properties", csharpStringTargetType(),
    "object-shape").kind, "rejected", "the superseded generic class helper is not retained");
});
