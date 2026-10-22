import assert from "node:assert/strict";
import test from "node:test";
import { sourceNativeCalleeFiles } from "../../../../../tsonic/test/fixtures/source-native-callees.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { planCsharpNativeFunctionCallee, planCsharpNativeMethodCallee } from "../../../../dist/backend/planner/expressions/calls/native-callees.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { analyzeCsharpMemberReceivers } from "../../../../dist/analysis/objects/member-receivers.js";
import { analyzeCsharpSourceMemberNames } from "../../../../dist/analysis/objects/source-member-names.js";

const plannerInvariant = message => error => error instanceof Error && error.phase === "planning" && error.message === message;

// The member-receiver analysis seals native callee acquisition for one source-owned call whose callee is `expression`.
function sealedCallees({ selected, property, member, projects = {}, identifier = false, references = {} }) {
  const call = {};
  const operations = {
    selectedCall: { get: node => node === call ? { target: { kind: "source-owned" }, sourceCall: selected } : undefined },
    selectedProperty: { get: node => node === selected.expression ? property : undefined },
    selectedElement: { get: () => undefined },
    selectedConstruction: { get: () => undefined },
    sourceMember: { get: node => node === selected.expression ? member : undefined },
  };
  const analysis = analyzeCsharpMemberReceivers({
    source: { ast: { name: () => undefined, is: { IsIdentifier: node => identifier && node === selected.expression } },
      navigation: { expressionEffects: () => ({ suspends: false }) } },
    nodes: [call], operations, references,
    projects: { projectSourceReference: { get: () => undefined }, projectSourceType: { get: () => undefined }, ...projects },
    factories: { classFactory: { get: () => undefined } }, admitted: () => true });
  const names = analyzeCsharpSourceMemberNames({ ast: { name: () => undefined, as: { AsPropertyAccessExpression: () => undefined } },
    nodes: [selected.expression], operations,
    names: { resolve: () => undefined }, rendered: () => true });
  return { analysis, names };
}

test("native function references retain exact lexical overrides without acquiring delegate carriers", () => {
  const expression = {};
  const parent = createDestructuringPlannerState();
  const state = createDestructuringPlannerState();
  state.parent = parent;
  const outer = { kind: "IdentifierName", name: "outerSelf" };
  const inner = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "retainedFrame" }, name: "invoke" };
  parent.expressionOverrides.set(expression, outer);
  const selected = { kind: "function", expression };
  // An identifier callee with its declaration reference syntax is acquired as an identifier.
  const { analysis } = sealedCallees({ selected, identifier: true,
    references: { identifierEmission: { get: node => node === expression ? { kind: "declaration" } : undefined } } });
  assert.deepEqual(analysis.issues, []);
  const input = { program: { source: { ast: { is: { IsIdentifier: node => node === expression } } },
    records: { nativeFunctionCallee: analysis.records.nativeFunctionCallee } } };
  const diagnostics = [];
  assert.equal(planCsharpNativeFunctionCallee(selected, {}, input, diagnostics, state) === outer, true);
  state.expressionOverrides.set(expression, inner);
  assert.equal(planCsharpNativeFunctionCallee(selected, {}, input, diagnostics, state) === inner, true);
  assert.equal(parent.expressionOverrides.get(expression) === outer, true, "another activation is not mutated");
  assert.equal(diagnostics.length, 0);
});

test("native method planning requires one exact closed member contract", () => {
  const expression = {};
  const receiver = {};
  const declaration = {};
  const carrier = csharpSourcePrimitiveTargetType("int32");
  const selected = { kind: "method", expression, declaration, receiver: { expression: receiver, type: carrier } };
  const member = { memberKind: "method", targetName: "read", type: carrier };
  const sourceOwned = { objectShape: { targetType: carrier, members: [member] }, shapeMember: { kind: "resolved", member },
    jsValueOperation: { kind: "not-js-value" }, runtimeUnionProperty: { kind: "not-runtime-union" } };
  const classification = { selection: { kind: "source-owned", source: { callCallee: true,
    selectedDeclaration: declaration, receiver: { expression: receiver, type: {} } } }, sourceOwned };
  const plan = subject => {
    assert.equal(subject === receiver, true, "only the receiver is evaluated");
    return csharpPlannedValue(carrier, { kind: "IdentifierName", name: "receiver" });
  };
  const invoke = fact => {
    const { analysis, names } = sealedCallees({ selected, property: fact, member: fact?.sourceOwned });
    const diagnostics = [];
    const input = { program: { records: { nativeMethodCallee: analysis.records.nativeMethodCallee,
      memberReceiver: analysis.records.memberReceiver, sourceMemberName: names.records.sourceMemberName,
      valueRead: { get: () => undefined } } } };
    const result = () => planCsharpNativeMethodCallee(selected, {}, input, diagnostics, plan);
    return { issues: analysis.issues, result, diagnostics };
  };
  const valid = invoke(classification);
  assert.deepEqual(valid.issues, []);
  const planned = valid.result();
  assert.equal(planned?.name, "read");
  assert.equal(planned?.kind, "value");
  assert.equal(valid.diagnostics.length, 0);
  for (const [label, fact] of [
    ["missing classification", undefined],
    ["not a direct callee", { ...classification, selection: { ...classification.selection,
      source: { ...classification.selection.source, callCallee: false } } }],
    ["missing shape member", { ...classification, sourceOwned: { ...sourceOwned, shapeMember: undefined } }],
    ["rejected shape member", { ...classification, sourceOwned: { ...sourceOwned, shapeMember: { kind: "rejected" } } }],
    ["stored callable field", { ...classification, sourceOwned: { ...sourceOwned,
      shapeMember: { kind: "resolved", member: { ...member, memberKind: "property" } } } }],
    ["JS-value operation", { ...classification, sourceOwned: { ...sourceOwned, jsValueOperation: { kind: "resolved" } } }],
    ["runtime-union operation", { ...classification, sourceOwned: { ...sourceOwned, runtimeUnionProperty: { kind: "resolved" } } }],
  ]) {
    // The analysis refuses the unclosed member contract; the planner never acquires an unsealed callee.
    const rejected = invoke(fact);
    assert.equal(rejected.issues.length, 1, label);
    assert.throws(rejected.result, plannerInvariant("An admitted native method requires its exact sealed member acquisition plan."), label);
    assert.equal(rejected.diagnostics.length, 0, label);
  }
});

test("generic class static callees remain exact namespace syntax, never runtime receiver operands", () => {
  const expression = {};
  const receiver = {};
  const declaration = {};
  const classDeclaration = {};
  const className = {};
  const file = { IsDeclarationFile: false };
  const sourceOwned = { jsValueOperation: { kind: "not-js-value" }, runtimeUnionProperty: { kind: "not-runtime-union" } };
  const classification = { selection: { kind: "source-owned", source: { callCallee: true,
    selectedDeclaration: declaration, receiver: { expression: receiver, type: {} } } }, sourceOwned };
  const selected = { kind: "method", expression, declaration };
  // The receiver names a project class: the project emission publishes its source type, so the receiver is a type.
  const projects = { projectSourceReference: { get: node => node === receiver ? classDeclaration : undefined },
    projectSourceType: { get: node => node === classDeclaration ? { name: className, scopeName: "ModuleScope" } : undefined } };
  const run = fact => {
    const { analysis } = sealedCallees({ selected, property: fact, member: fact.sourceOwned, projects });
    const input = {
      program: { source: { ast: { getSourceFile: () => file } },
        records: { nativeMethodCallee: analysis.records.nativeMethodCallee, memberReceiver: analysis.records.memberReceiver,
          sourceMemberName: { get: node => node === expression ? { read: "identity", method: undefined } : undefined },
          projectSourceReference: projects.projectSourceReference, projectSourceType: projects.projectSourceType,
          classFactory: { get: () => undefined },
          sourceName: { get: node => node === className ? { kind: "resolved", name: "Entry" } : undefined } } },
    };
    return { issues: analysis.issues, input };
  };
  const admitted = run(classification);
  assert.deepEqual(admitted.issues, []);
  const diagnostics = [];
  const result = planCsharpNativeMethodCallee(selected, file, admitted.input, diagnostics,
    () => assert.fail("native static calls must not acquire or capture a constructor delegate"));
  assert.equal(result?.kind, "type");
  assert.equal(result?.name, "identity");
  assert.deepEqual(result.receiver,
    { kind: "QualifiedName", left: { kind: "IdentifierName", name: "ModuleScope" }, name: "Entry" });
  assert.equal(diagnostics.length, 0);
  // Rejected receiver evidence is refused by the analysis; native type syntax cannot conceal it.
  const rejected = run({ ...classification, receiverProjection: {
    conversion: { kind: "rejected", reason: "missing selected native receiver proof" },
  } });
  assert.equal(rejected.issues.length, 1);
  assert.match(rejected.issues[0].message, /missing selected native receiver proof/u);
  assert.throws(() => planCsharpNativeMethodCallee(selected, file, rejected.input, [],
    () => assert.fail("rejected evidence must not acquire a constructor delegate")),
  plannerInvariant("An admitted native method requires its exact sealed member acquisition plan."));
});

for (const surface of ["native", "js"]) {
  test(`direct native callees are syntax rather than acquired delegates in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceNativeCalleeFiles["index.ts"],
      files: { "helper.ts": sourceNativeCalleeFiles["helper.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/\.read\(\)/u.test(generated), true);
    assert.equal(/\.identity<int>\(/u.test(generated), true);
    assert.equal(/new\s+(?:global::)?System\.(?:Action|Func)/u.test(generated), false);
  });
}
