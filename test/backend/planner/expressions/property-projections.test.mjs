import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpPropertyValueProjection } from "../../../../dist/backend/planner/expressions/property-value-projection.js";
import { createCsharpObjectShapePropertyOrderIndex } from "../../../../dist/analysis/objects/property-order.js";
import { csharpNeverTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/index.js";
import { requireObjectShapeProjection } from "../../../../dist/analysis/objects/native-demand-requests.js";
import { analyzeCsharpPropertyValueProjection } from "../../../../dist/analysis/conversions/property-value-projection.js";
import { selectCsharpClosedShapeConversion } from "../../../../dist/policy/types/objects/closed-object-shapes.js";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../../dist/backend/planner/expressions/planned-values.js";

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
  { resolveTarget: () => shape }, undefined, { objectLiteral: { get: () => undefined } }, {});
  const analysis = analyze(projected);
  const input = { program: { source: { ast: { pos: () => 1 } },
    records: { propertyValueProjection: analysis.records.propertyValueProjection,
      nativeExpression: { get: subject => subject === node ? { discardEvaluation: "evaluate", use: { kind: "value", expression: node,
        carrier: source, completion: { kind: "value", type: source }, children: [], evaluation: { kind: "creation" } } } : undefined } } }, scope: {},
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
  let evaluations = 0;
  const planned = planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, csharpTsValueTargetType(), subject => {
    assert.equal(subject === current.node, true, "only the actual supplier is planned");
    evaluations++;
    return csharpPlannedValue(current.source, expression);
  });
  const selected = planned?.completion.expression;
  assert.equal(diagnostics.length, 0);
  assert.equal(evaluations, 1, "the supplier is planned once");
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
  assert.throws(() => planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, csharpTsValueTargetType(),
    () => csharpPlannedValue(current.source, { kind: "IdentifierName", name: "value" })), error => error instanceof Error && error.phase === "planning" &&
    error.message === "An admitted property projection requires its exact native representation.",
  "the planner never plans an unsealed projection");
  assert.equal(diagnostics.length, 0);
  assert.equal(requireObjectShapeProjection({}, undefined, current.source, {}, "properties", csharpStringTargetType(),
    "object-shape").kind, "rejected", "the superseded generic class helper is not retained");
});

function literalFixture(change = () => {}) {
  const current = fixture();
  const source = { ...current.source, csharpGeneratedStructuralStorage: true };
  const first = { sourceKey: { kind: "property", name: "first" }, sourceName: "first", targetName: "storedFirst",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("float64") };
  const second = { sourceKey: { kind: "property", name: "second" }, sourceName: "second", targetName: "storedSecond",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64") };
  const shape = { targetType: source, members: [first, second] };
  const initializers = [{ initializer: {}, property: {}, member: first, kind: "value" },
    { initializer: {}, property: {}, member: second, kind: "value" }];
  const literal = { kind: "native", members: initializers, initialization: { inlineUnique: true, deferred: [],
    slots: [first, second].map(member => ({ name: member.targetName, carrier: member.type, initializeAbsence: false })) } };
  const members = [second, first].map(member => ({ member,
    conversion: selectCsharpClosedShapeConversion({ kind: "js-value-box" }, csharpTsValueTargetType()).value }));
  const key = {};
  const state = { source, shape, initializers, literal, members, literalAvailable: true, keyAvailable: false,
    keyEffects: { invokes: false, mutates: false, suspends: false, mayThrow: false } };
  change(state);
  const program = { ast: { name: () => state.keyAvailable ? key : undefined,
    is: { IsComputedPropertyName: node => node === key }, as: { AsComputedPropertyName: () => ({ Expression: key }) } },
    navigation: { expressionEffects: () => state.keyEffects } };
  const analysis = analyzeCsharpPropertyValueProjection({ propertyProjectionRoots: [{ node: current.node, carrier: source }],
    propertyProjection: { get: (subject, carrier) => subject === current.node && carrier === source ? members : undefined } },
  { resolveTarget: carrier => carrier === source ? shape : undefined }, undefined,
  { objectLiteral: { get: (selectedShape, subject) => state.literalAvailable && selectedShape === shape && subject === current.node ? literal : undefined } }, program);
  current.input.program.records.propertyValueProjection = analysis.records.propertyValueProjection;
  current.input.program.records.nativeExpression = { get: subject => subject === current.node ? { use: { kind: "value", expression: subject,
    carrier: source, completion: { kind: "value", type: source }, children: [], evaluation: { kind: "creation" } } } : undefined };
  return { ...current, ...state, analysis };
}

test("fresh native property literals evaluate exact storage values once before their closed projection without allocating the source object", () => {
  const current = literalFixture();
  const order = [];
  const state = {};
  let nextName = 0;
  current.input.names.temporaryName = base => `${base}_${nextName++}`;
  const diagnostics = [];
  const selected = planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, csharpTsValueTargetType(),
    (subject, _file, _input, _diagnostics, selectedState) => {
      assert.equal(selectedState === state, true, "the original capture state reaches each initializer");
      const position = current.initializers.findIndex(initializer => initializer.initializer === subject);
      assert.equal(position >= 0, true, "the native source object is never planned or allocated");
      order.push(position);
      return csharpPlannedValue(current.initializers[position].member.type,
        { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: `supply${position}` }, arguments: [] },
        [{ kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
          callee: { kind: "IdentifierName", name: `before${position}` }, arguments: [] } }]);
    }, state);
  assert.deepEqual(current.analysis.issues, []);
  assert.equal(diagnostics.length, 0);
  assert.deepEqual(order, [0, 1], "source initializer order is independent of selected member order");
  assert.deepEqual(selected.prelude.map(statement => statement.kind === "LocalDeclarationStatement"
    ? statement.initializer.callee.name : statement.expression.callee.name), ["before0", "supply0", "before1", "supply1"],
  "all native storage initializers complete before any property-view conversion");
  const stored = selected.prelude.filter(statement => statement.kind === "LocalDeclarationStatement");
  assert.deepEqual(stored.map(statement => statement.type.name), ["double", "ulong"], "native field widths are retained without a source object");
  const expression = selected.completion.expression;
  assert.equal(expression.kind, "InvocationExpression");
  assert.equal(expression.callee.name, "CreateDynamicObject");
  assert.deepEqual(expression.arguments.filter((_, index) => index % 2 === 0).map(argument => argument.expression.value), ["second", "first"]);
  assert.deepEqual(expression.arguments.filter((_, index) => index % 2 === 1)
    .map(argument => argument.expression.arguments[0].expression.name), [stored[1].name, stored[0].name],
  "the exact native slot is projected once in selected member order");
});

test("literal projection eligibility preserves aliases, key effects, methods, spreads, duplicate slots and deferred identity", () => {
  for (const [label, change] of [
    ["alias", state => { state.literalAvailable = false; }],
    ["native class", state => { state.source.csharpGeneratedStructuralStorage = false; }],
    ["deferred", state => { state.literal.initialization.deferred.push({ name: "later", carrier: state.source }); }],
    ["duplicate", state => { state.literal.initialization.inlineUnique = false; }],
    ["method", state => { state.initializers[0].kind = "method"; }],
    ["accessor", state => { state.initializers[0].member.accessor = { getter: true, setter: false }; }],
    ["spread", state => { state.initializers[0].kind = "spread"; }],
    ["bound storage", state => { state.initializers[0].member.bound = true; }],
    ["capture", state => { state.shape.methodImplementation = { captures: [{}] }; }],
    ["unprojected member", state => { state.members.pop(); }],
    ...["invokes", "mutates", "suspends", "mayThrow"].map(effect => [`computed key ${effect}`, state => {
      state.keyAvailable = true; state.keyEffects[effect] = true;
    }]),
  ]) {
    const current = literalFixture(change);
    const selected = current.analysis.records.propertyValueProjection.get(current.node, current.source);
    assert.equal(selected?.kind === "object" && selected.literal === undefined, true, `${label}: no literal elision without complete proof`);
  }
  const pureKey = literalFixture(state => { state.keyAvailable = true; });
  assert.equal(pureKey.analysis.records.propertyValueProjection.get(pureKey.node, pureKey.source)?.literal?.length, 2,
    "a checked effect-free key preserves the actual literal recipe");
});

test("an exiting native literal initializer preserves its effects and never plans later members or a property view", () => {
  const current = literalFixture();
  const diagnostics = [];
  let count = 0;
  const never = csharpNeverTargetType();
  const selected = planCsharpPropertyValueProjection(current.node, {}, current.input, diagnostics, csharpTsValueTargetType(), subject => {
    assert.equal(subject === current.initializers[0].initializer, true, "only the first initializer is reached");
    count++;
    return csharpPlannedEffect(never, [{ kind: "ThrowStatement", expression: { kind: "IdentifierName", name: "failure" } }], "never");
  });
  assert.equal(count, 1);
  assert.equal(selected.completion.kind, "never");
  assert.deepEqual(selected.prelude.map(statement => statement.kind), ["ThrowStatement"]);
  assert.equal(diagnostics.length, 0);
});
