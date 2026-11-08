import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { admitCsharpConversionSelection, csharpRuntimeUnionMappingMatches } from "../../../dist/analysis/conversions/validation.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpUnionReferenceImplicitlyAccepts } from "../../../dist/policy/conversions/carriers.js";
import { csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTargetNamedType } from "../../../dist/target-model/types/index.js";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpUnionArmMappingsMatch, selectCsharpUnionArmMapping } from "../../../dist/policy/conversions/union-relations.js";
import { csharpTypeEmissionRecord } from "../../helpers/planning-records.mjs";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";

const reference = (name, arguments_) => csharpTargetNamedType(`fixture.${name}`, arguments_, { kind: "named", name }, { allowsRefLikeTypeArguments: ((arguments_) ?? []).map(() => false),});

function fixture({ siblings = false, nested = false } = {}) {
  const base = reference("Base");
  const derived = reference("Derived");
  const second = reference("Second");
  const unrelated = reference("Unrelated");
  const text = csharpStringTargetType();
  const sourceArms = [text, derived, ...(siblings ? [second] : [])];
  const source = csharpRuntimeUnionTargetType(sourceArms);
  const inner = nested ? csharpRuntimeUnionTargetType([base, csharpSourcePrimitiveTargetType("bool")]) : undefined;
  const target = csharpRuntimeUnionTargetType([text, inner ?? base]);
  const policy = createNativeConversionHost({ heritage: [
    { carrier: derived, supertypes: [base] }, { carrier: second, supertypes: [base] },
  ] });
  return { source, target, inner, base, derived, second, unrelated, text, policy };
}

function planningContext(policy) {
  const checked = checkCsharpSource({ sourceText: 'export function Produce(): string { return "value"; } export function run(): string { return Produce(); }' });
  assertCsharpCheckingSucceeded(checked);
  let site;
  const visit = node => {
    if (checked.source.ast.is.IsCallExpression(node)) site = node;
    checked.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of checked.source.sourceFiles) if (!checked.source.ast.isDeclarationFile(file)) visit(file);
  assert.equal(site !== undefined, true, "the planner is anchored at the actual original invocation");
  return { site, program: { source: checked.source,
    records: { typeEmission: csharpTypeEmissionRecord() },
    typeDefinitions: policy.typeDefinitions }, scope: {}, names: { temporaryName: name => name } };
}

test("C# nominal union widening uses exact native reference facts and unchanged closed arm metadata", () => {
  {
    const { source, target, base, derived, policy } = fixture();
    assert.equal(selectCsharpUnionArmMapping(source, target, "source"), undefined);
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

test("authored Source aliases produce the same Native nominal mapping without a second Source-sum registry", () => {
  const compiled = analyzeCsharpSource({ sourceText: `
    export class Base { value: number = 0; }
    export class Derived extends Base { extra: number = 1; }
    export type Input = string | Derived;
    export type Output = string | Base;
    export declare function inspect(input: Input, output: Output): void;
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const source = compiled.source;
  const program = compiled.analysis.value;
  const parameters = new Map();
  const visit = node => {
    if (source.ast.is.IsParameterDeclaration(node)) parameters.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const carrier = name => {
    const site = parameters.get(name);
    const evidence = resolvedSourceValue(source.facts.values.declaredSlot(site), "original alias parameter").type;
    const represented = program.representation.represent(evidence, "storage", site);
    assert.equal(represented.kind, "represented");
    assert.equal(represented.value.evidence === evidence, true);
    return represented.value.carrier;
  };
  const input = carrier("input");
  const output = carrier("output");
  const conversion = selectCsharpConversion(program.analysis.policy, input, output, "implicit");
  assert.equal(conversion.kind, "union-map");
  assert.equal(csharpRuntimeUnionMappingMatches(program.analysis.policy, input, output, conversion), true);
  assert.equal(selectCsharpConversion(program.analysis.policy, output, input, "implicit").kind, "rejected");
  assert.equal(Object.hasOwn(program.typeDefinitions, "sourceUnionArms"), false,
    "Source arms stay exclusively in the authenticated Source application");
});

test("C# union mapping prefers exact carriers and rejects ambiguous or repeated nominal destinations", () => {
  const { source, target, base, derived, second, unrelated, text, policy } = fixture({ siblings: true, nested: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selection.kind, "union-map");
  assert.deepEqual(selection.arms.map(arm => arm.target.map(step => step.index)), [[0], [1, 0], [1, 0]]);
  const exactTarget = csharpRuntimeUnionTargetType([text, base, derived, second]);
  const exact = selectCsharpUnionArmMapping(source, exactTarget, "source",
    () => assert.fail("identical native carriers do not consult nominal relations"));
  assert.deepEqual(exact.map(arm => arm.target[0].index), [0, 2, 3]);
  assert.equal(selectCsharpConversion(policy, source, exactTarget, "implicit").kind, "union-map");
  const ambiguous = { ...policy, projectTypes: { directSupertypes: carrier =>
    [derived, second].some(candidate => targetTypeRefEquals(candidate, carrier)) ? [base, unrelated] : [] } };
  assert.equal(selectCsharpConversion(ambiguous, source, csharpRuntimeUnionTargetType([text, base, unrelated]), "implicit").kind, "rejected");
  const duplicate = csharpRuntimeUnionTargetType([derived, second, derived]);
  assert.equal(selectCsharpConversion(policy, duplicate, csharpRuntimeUnionTargetType([base, text]), "implicit").kind, "rejected");
  const repeatedSources = [duplicate, csharpRuntimeUnionTargetType([derived, csharpRuntimeUnionTargetType([second, derived])])];
  const repeatedTargets = [csharpRuntimeUnionTargetType([base, text]),
    csharpRuntimeUnionTargetType([text, csharpRuntimeUnionTargetType([base, csharpSourcePrimitiveTargetType("bool")])])];
  for (const repeatedSource of repeatedSources) for (const repeatedTarget of repeatedTargets) {
    for (const mode of ["implicit", "explicit"]) {
      assert.equal(selectCsharpConversion(policy, repeatedSource, repeatedTarget, mode).kind, "rejected",
        `${mode}: a rejected repeated union mapping cannot re-enter through a whole-union reference injection`);
      assert.equal(selectCsharpConversion(policy, csharpNullableTargetType(repeatedSource),
        csharpNullableTargetType(repeatedTarget), mode).kind, "rejected",
        `${mode}: nullable composition retains the same repeated-arm refusal`);
    }
  }
  assert.equal(selectCsharpUnionArmMapping(source, target, "target",
    (from, to) => csharpUnionReferenceImplicitlyAccepts(policy, from, to)), undefined);
});

test("C# nominal arm admission does not manufacture covariance, numeric width changes, boxing or absence loss", () => {
  const { base, derived, text, policy } = fixture();
  const integer = csharpSourcePrimitiveTargetType("int64");
  const unsigned = csharpSourcePrimitiveTargetType("uint64");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const value = csharpTargetNamedType(derived.id, undefined, { kind: "named", name: "Value" }, { allowsRefLikeTypeArguments: [], valueType: true });
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
  assert.equal(selectCsharpUnionArmMapping(reference("LoopUnion"), reference("TargetUnion"), "source"), undefined,
    "unrelated Native named types cannot become unions through a second Source-arm lookup");
});

test("C# sealed nominal mapping validation rejects stale relationships and malformed closed metadata without executing getters", () => {
  const { source, target, policy } = fixture({ nested: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  const context = planningContext(policy);
  assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, selection), true);
  assert.equal(admitCsharpConversionSelection(policy, source, target, selection), selection, "a valid mapping is admitted unchanged");
  assert.equal(Object.hasOwn(context.program, "conversions"), false, "planning has no conversion validation service");
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
    assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, { ...selection, arms }), false);
    assert.equal(admitCsharpConversionSelection(policy, source, target, { ...selection, arms }).kind, "rejected");
  }
  assert.equal(getterCalls, 0);
  const getterSelection = { ...selection };
  Object.defineProperty(getterSelection, "arms", { enumerable: true, get() { getterCalls++; throw new Error("must not execute"); } });
  for (const selected of [getterSelection, { ...selection, extra: true }, { ...selection, coverage: "all" },
    { ...selection, kind: "legacy-union-map" }]) {
    assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, selected), false);
    if (selected.kind === "union-map") assert.equal(admitCsharpConversionSelection(policy, source, target, selected).kind, "rejected");
  }
  assert.equal(getterCalls, 0);
  assert.equal(csharpRuntimeUnionMappingMatches(policy, target, source, selection), false);
  assert.deepEqual(admitCsharpConversionSelection(policy, target, source, selection), { kind: "rejected",
    reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." });
  assert.equal(csharpRuntimeUnionMappingMatches({ ...policy, projectTypes: { directSupertypes: () => [] } }, source, target, selection), false);
  assert.equal(csharpRuntimeUnionMappingMatches(policy, source, target, { ...selection, coverage: "target" }), false);
  assert.equal(csharpUnionArmMappingsMatch(source, target, "source", selection.arms), false);
});

test("C# nominal union emission retains one evaluation and native payload references without copies or adapters", () => {
  const { source, target, policy } = fixture({ siblings: true, nested: true });
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  const context = planningContext(policy);
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "Produce" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpUnionMapping(context.site, expression, source, target, selection, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression, expression);
  assert.equal(JSON.stringify(planned).match(/Produce/gu).length, 1);
  assert.equal(planned.arms[1].expression.callee.name, "From2");
  assert.equal(planned.arms[1].expression.arguments[0].expression.callee.name, "From1");
  assert.equal(planned.arms[1].expression.arguments[0].expression.arguments[0].expression.kind, "InvocationExpression");
  assert.doesNotMatch(JSON.stringify(planned.arms.slice(0, -1)), /CastExpression|ObjectCreationExpression|clone|Clone|ToArray|ToDictionary|Func|Reflect|Box/u);
  const optional = planCsharpUnionMapping(context.site, expression, csharpNullableTargetType(source), csharpNullableTargetType(target),
    selection, context, diagnostics);
  assert.equal(optional.arms.at(-2).pattern.kind, "ConstantPattern");
  assert.equal(optional.arms.at(-2).pattern.expression.value, null);
  assert.equal(optional.arms.at(-2).expression.kind, "DefaultExpression");
  const stale = { ...policy, projectTypes: { directSupertypes: () => [] } };
  assert.deepEqual(admitCsharpConversionSelection(stale, source, target, selection), { kind: "rejected",
    reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." },
    "a stale nominal relationship is rejected at admission");
  assert.equal(diagnostics.length, 0);
});
