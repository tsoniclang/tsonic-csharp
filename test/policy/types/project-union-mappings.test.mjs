import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { csharpRuntimeUnionMappingMatches } from "../../../dist/analysis/conversions/validation.js";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpUnionReferenceImplicitlyAccepts } from "../../../dist/policy/conversions/selection/carriers.js";
import { csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTargetNamedType } from "../../../dist/target-model/types/index.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpUnionArmMappingsMatch, selectCsharpUnionArmMapping } from "../../../dist/target-model/types/union-relations.js";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";

const reference = (name, arguments_) => csharpTargetNamedType(`fixture.${name}`, arguments_, { kind: "named", name });

function fixture({ siblings = false, nested = false, authored = false } = {}) {
  const base = reference("Base");
  const derived = reference("Derived");
  const second = reference("Second");
  const unrelated = reference("Unrelated");
  const text = csharpStringTargetType();
  const sourceArms = [text, derived, ...(siblings ? [second] : [])];
  const registry = createCsharpTypeDefinitionRegistry();
  const union = (name, arms) => {
    if (!authored) return csharpRuntimeUnionTargetType(arms);
    const carrier = csharpSourceUnionTargetType(`fixture.${name}`, name, []);
    assert.equal(registry.registerSourceUnion({ carrier, arms }), true);
    return carrier;
  };
  const source = union("Source", sourceArms);
  const inner = nested ? union("Inner", [base, csharpSourcePrimitiveTargetType("bool")]) : undefined;
  const target = union("Target", [text, inner ?? base]);
  const definitions = registry.seal();
  const policy = { typeDefinitions: definitions, sourceFiles: [], target: {},
    projectTypes: { directSupertypes: carrier => [derived, second].some(candidate => targetTypeRefEquals(candidate, carrier)) ? [base] : [] },
    providers: { findTargetBindingByTargetId: () => undefined },
  };
  return { source, target, inner, base, derived, second, unrelated, text, policy, definitions };
}

function planningContext(policy) {
  const analysis = analyzeCsharpConversions(policy, {}, {});
  const conversions = analysis.seal({ operations: {}, expectedTypes: {}, storage: {} });
  return { program: { source: { ast: { pos: () => 0, end: () => 5 } }, conversions,
    typeDefinitions: policy.typeDefinitions }, scope: {}, names: { temporaryName: name => name } };
}

test("C# nominal union widening uses exact native reference facts and unchanged closed arm metadata", () => {
  for (const authored of [false, true]) {
    const { source, target, base, derived, policy, definitions } = fixture({ authored });
    assert.equal(selectCsharpUnionArmMapping(source, target, "source", definitions), undefined);
    const selection = selectCsharpConversion(policy, source, target, "implicit");
    assert.equal(selection.kind, "union-map");
    assert.equal(selection.coverage, "source");
    assert.deepEqual(selection.arms.map(arm => arm.target.map(step => step.index)), [[0], [1]]);
    assert.deepEqual(selection.arms[1].carrier, derived);
    assert.equal(csharpUnionReferenceImplicitlyAccepts(policy, derived, base), true);
    assert.equal(csharpUnionReferenceImplicitlyAccepts(policy, base, derived), false);
    assert.ok(Object.isFrozen(selection.arms) && selection.arms.every(Object.isFrozen));
    assert.deepEqual(Object.keys(selection.arms[1]).sort(), ["carrier", "source", "target"]);
    assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, selection), true);
    assert.equal(selectCsharpConversion(policy, target, source, "implicit").kind, "rejected");
    const nullable = selectCsharpConversion(policy, csharpNullableTargetType(source), csharpNullableTargetType(target), "implicit");
    assert.equal(nullable.kind, "nullable-map");
    assert.deepEqual(nullable.conversion, selection);
  }
});

test("C# union mapping prefers exact carriers and rejects ambiguous or repeated nominal destinations", () => {
  const { source, target, base, derived, second, unrelated, text, policy, definitions } = fixture({ siblings: true, nested: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selection.kind, "union-map");
  assert.deepEqual(selection.arms.map(arm => arm.target.map(step => step.index)), [[0], [1, 0], [1, 0]]);
  const exactTarget = csharpRuntimeUnionTargetType([text, base, derived, second]);
  const exact = selectCsharpUnionArmMapping(source, exactTarget, "source", definitions,
    () => assert.fail("identical native carriers do not consult nominal relations"));
  assert.deepEqual(exact.map(arm => arm.target[0].index), [0, 2, 3]);
  assert.equal(selectCsharpConversion(policy, source, exactTarget, "implicit").kind, "union-map");
  const ambiguous = { ...policy, projectTypes: { directSupertypes: carrier =>
    [derived, second].some(candidate => targetTypeRefEquals(candidate, carrier)) ? [base, unrelated] : [] } };
  assert.equal(selectCsharpConversion(ambiguous, source, csharpRuntimeUnionTargetType([text, base, unrelated]), "implicit").kind, "rejected");
  const duplicate = csharpRuntimeUnionTargetType([derived, second, derived]);
  assert.equal(selectCsharpConversion(policy, duplicate, csharpRuntimeUnionTargetType([base, text]), "implicit").kind, "rejected");
  assert.equal(selectCsharpUnionArmMapping(source, target, "target", definitions,
    (from, to) => csharpUnionReferenceImplicitlyAccepts(policy, from, to)), undefined);
});

test("C# nominal arm admission does not manufacture covariance, numeric width changes, boxing or absence loss", () => {
  const { base, derived, text, policy } = fixture();
  const integer = csharpSourcePrimitiveTargetType("int64");
  const unsigned = csharpSourcePrimitiveTargetType("uint64");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const value = csharpTargetNamedType(derived.id, undefined, { kind: "named", name: "Value" }, { valueType: true });
  const nullableDerived = csharpNullableTargetType(derived);
  const cases = [[value, base], [nullableDerived, base], [csharpAbsenceTargetType(), base],
    [integer, unsigned], [integer, floating],
    [{ kind: "array", element: derived }, { kind: "array", element: base }],
    [reference("Generic", [derived]), reference("Generic", [base])],
    [reference("Generic", [integer]), reference("Generic", [unsigned])]];
  for (const [source, target] of cases) {
    assert.equal(csharpUnionReferenceImplicitlyAccepts(policy, source, target), false);
    assert.equal(selectCsharpConversion(policy, csharpRuntimeUnionTargetType([text, source]),
      csharpRuntimeUnionTargetType([text, target]), "implicit").kind, "rejected");
  }
  assert.equal(csharpUnionReferenceImplicitlyAccepts(policy, nullableDerived, csharpNullableTargetType(base)), true);
  const cycle = { ...policy, projectTypes: { directSupertypes: carrier => targetTypeRefEquals(carrier, derived)
    ? [reference("Loop")] : targetTypeRefEquals(carrier, reference("Loop")) ? [derived] : [] } };
  assert.equal(selectCsharpConversion(cycle, csharpRuntimeUnionTargetType([text, derived]),
    csharpRuntimeUnionTargetType([text, base]), "implicit").kind, "rejected");
  const unionCycle = { ...policy, typeDefinitions: { ...policy.typeDefinitions, sourceUnionArms: carrier => [carrier] } };
  assert.equal(selectCsharpUnionArmMapping(reference("LoopUnion"), reference("TargetUnion"), "source", unionCycle.typeDefinitions), undefined);
});

test("C# sealed nominal mapping validation rejects stale relationships and malformed closed metadata without executing getters", () => {
  const { source, target, policy } = fixture({ nested: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  const context = planningContext(policy);
  assert.equal(context.program.conversions.select(source, target, "implicit"), undefined);
  assert.equal(context.program.conversions.matchesUnionMapping(source, target, selection), true);
  let getterCalls = 0;
  const getter = { ...selection.arms[1].carrier };
  Object.defineProperty(getter, "id", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  const cycle = reference("Generic", []);
  cycle.typeArguments = [cycle];
  const getterArm = { ...selection.arms[1] };
  Object.defineProperty(getterArm, "source", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  const getterPath = { ...selection.arms[1].target[0] };
  Object.defineProperty(getterPath, "union", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  const getterArray = [...selection.arms];
  Object.defineProperty(getterArray, "1", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  for (const arms of [selection.arms.slice(1), selection.arms.toReversed(), [...selection.arms, selection.arms[0]],
    selection.arms.map(arm => ({ ...arm, extra: true })),
    selection.arms.map(({ carrier, ...arm }) => arm),
    [{ ...selection.arms[0], target: [] }, selection.arms[1]],
    [selection.arms[0], { ...selection.arms[1], carrier: getter }],
    [selection.arms[0], { ...selection.arms[1], carrier: cycle }],
    [selection.arms[0], getterArm], getterArray,
    [selection.arms[0], { ...selection.arms[1], target: [getterPath, ...selection.arms[1].target.slice(1)] }],
    [selection.arms[0], { ...selection.arms[1], target: selection.arms[1].target.toReversed() }],
    [selection.arms[0], { ...selection.arms[1], target: [{ ...selection.arms[1].target[0], index: 99 }] }],
    new Array(2)]) {
    assert.equal(context.program.conversions.matchesUnionMapping(source, target, { ...selection, arms }), false);
  }
  assert.equal(getterCalls, 0);
  const getterSelection = { ...selection };
  Object.defineProperty(getterSelection, "arms", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  for (const selected of [getterSelection, { ...selection, extra: true }, { ...selection, coverage: "all" },
    { ...selection, kind: "legacy-union-map" }]) {
    assert.equal(context.program.conversions.matchesUnionMapping(source, target, selected), false);
  }
  assert.equal(getterCalls, 0);
  assert.equal(context.program.conversions.matchesUnionMapping(target, source, selection), false);
  assert.equal(csharpRuntimeUnionMappingMatches({ ...policy, projectTypes: { directSupertypes: () => [] } }, source, target, selection), false);
  assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, { ...selection, coverage: "target" }), false);
  assert.equal(csharpUnionArmMappingsMatch(source, target, "source", selection.arms, policy.typeDefinitions), false);
});

test("C# nominal union emission retains one evaluation and native payload references without copies or adapters", () => {
  const { source, target, policy } = fixture({ siblings: true, nested: true, authored: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  const context = planningContext(policy);
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "Produce" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, expression, source, target, selection, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression, expression);
  assert.equal(JSON.stringify(planned).match(/Produce/gu).length, 1);
  assert.equal(planned.arms[1].expression.callee.name, "From2");
  assert.equal(planned.arms[1].expression.arguments[0].expression.callee.name, "From1");
  assert.equal(planned.arms[1].expression.arguments[0].expression.arguments[0].expression.kind, "InvocationExpression");
  assert.doesNotMatch(JSON.stringify(planned.arms.slice(0, -1)), /CastExpression|ObjectCreationExpression|clone|Clone|ToArray|ToDictionary|Func|Reflect|Box/u);
  const optional = planCsharpUnionMapping({}, expression, csharpNullableTargetType(source), csharpNullableTargetType(target),
    selection, context, diagnostics);
  assert.equal(optional.arms.at(-2).pattern.kind, "ConstantPattern");
  assert.equal(optional.arms.at(-2).pattern.expression.value, null);
  assert.equal(optional.arms.at(-2).expression.kind, "DefaultExpression");
  const stale = planningContext({ ...policy, projectTypes: { directSupertypes: () => [] } });
  assert.equal(planCsharpUnionMapping({}, expression, source, target, selection, stale, diagnostics), undefined);
  assert.equal(diagnostics.length, 1);
});
