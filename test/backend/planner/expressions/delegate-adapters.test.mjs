import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpDelegateAdapter, planCsharpDelegateAdaptationBody } from "../../../../dist/backend/planner/expressions/callable-conversions.js";
import { applyCsharpConversionSelection } from "../../../../dist/backend/planner/expressions/conversions.js";
import { admitCsharpConversionSelection } from "../../../../dist/analysis/conversions/validation.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType, isCsharpSourceDelegateTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpDelegateContractRecord, csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";
import { csharpMethodValueType } from "../../../../dist/target-model/types/method-values.js";
import { selectDelegateConversion } from "../../../../dist/policy/conversions/carriers.js";

const number = csharpSourcePrimitiveTargetType("float64");
const source = csharpDelegateTargetType("System.Action", []);
const target = csharpDelegateTargetType("System.Func", [number], csharpNullableTargetType(number));
const selection = { kind: "delegate-adapter", strategy: "adaptation", parameterConversions: [], returnConversion: { kind: "void-return" } };

// The analysis publishes one delegate contract per admitted conversion and the type emission of every carrier.
function context(conversions = [[source, target, selection]]) {
  const allocated = new Set();
  return { scope: {}, program: { records: { delegateContract: csharpDelegateContractRecord(conversions),
    typeEmission: csharpTypeEmissionRecord(), directCallableReference: { get: () => undefined },
    captureClosure: { get: () => undefined },
    namedSelf: { get: () => undefined } } }, names: { temporaryName(preferred) {
    let name = preferred;
    while (allocated.has(name)) name = `_${name}`;
    allocated.add(name);
    return name;
  } } };
}

test("native adapters snapshot an effectful callable once outside its invocation body", () => {
  const factory = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "make" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter({}, {}, context(), diagnostics, source, target, selection, factory, applyCsharpConversionSelection);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression.expression, factory);
  const adapter = planned.arms[0].expression.expression;
  assert.equal(adapter.body.statements[0].expression.callee.name, planned.arms[0].pattern.designation);
  assert.equal(JSON.stringify(planned).match(/"name":"make"/gu)?.length, 1);
  assert.equal(adapter.body.statements[1].expression.kind, "DefaultExpression");
});

test("monomorphic native method handles adapt their exact callable member without a delegate cast", () => {
  const owner = { kind: "target-named", id: "tsonic.shape:adapter-owner", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "NativeOwner" } };
  const handle = csharpMethodValueType(owner, "run", "actual-run-method", source, []);
  assert.equal(handle !== undefined, true, "the existing native method owner produces the actual handle");
  const selected = selectDelegateConversion({}, handle, target);
  assert.equal(selected?.kind === "delegate-adapter" && selected.strategy === "adaptation", true,
    "the existing conversion owner admits its actual monomorphic signature");
  assert.equal(admitCsharpConversionSelection({}, handle, target, selected) === selected, true,
    "independent admission validates the physical source and complete native adaptation");
  const factory = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "makeOwner" }, arguments: [] };
  const diagnostics = [];
  const input = context([[handle, target, selected], [handle, source,
    { kind: "delegate-adapter", strategy: "native-binding", parameterConversions: [], returnConversion: { kind: "void-return" } }]]);
  const planned = planCsharpDelegateAdapter({}, {}, input, diagnostics, handle, target, selected, factory, applyCsharpConversionSelection);
  assert.equal(planned.kind, "SwitchExpression", "the effectful original owner is captured exactly once");
  assert.equal(planned.expression.expression === factory, true, "the actual owner expression is not replaced");
  assert.equal(planned.expression.type.name, "NativeOwner", "the snapshot is the native owner, never Action or Func");
  const callee = planned.arms[0].expression.expression.body.statements[0].expression.callee;
  assert.equal(callee.name, "run", "the exact sealed method name is consumed");
  assert.equal(callee.receiver.name, planned.arms[0].pattern.designation, "the invocation uses the original snapshot");
  assert.equal(JSON.stringify(planned).match(/"name":"makeOwner"/gu)?.length, 1, "receiver effects occur once");
  const stable = { kind: "IdentifierName", name: "fixedOwner" };
  const stablePlan = planCsharpDelegateAdapter({}, {}, input, diagnostics, handle, target, selected, stable,
    applyCsharpConversionSelection, { kind: "stable-value" });
  assert.equal(stablePlan.kind, "LambdaExpression", "a proved fixed native owner adds no second capture frame");
  assert.equal(stablePlan.body.statements[0].expression.callee.receiver === stable, true, "the actual stable slot is retained");
  const binding = selectDelegateConversion({}, handle, source);
  assert.equal(binding?.kind === "delegate-adapter" && binding.strategy === "native-binding", true, "matching native signatures bind directly");
  const native = planCsharpDelegateAdapter({}, {}, input, diagnostics, handle, source, binding, factory, applyCsharpConversionSelection);
  assert.equal(native.kind, "ObjectCreationExpression", "only the requested native delegate is allocated");
  assert.equal(native.arguments[0].expression.receiver === factory && native.arguments[0].expression.name === "run", true,
    "native binding captures the exact method receiver once without a protocol-to-delegate cast");
  const retained = planCsharpDelegateAdaptationBody({}, {}, input, diagnostics, handle, target, selected, stable,
    applyCsharpConversionSelection);
  assert.equal(retained.body.statements[0].expression.callee.name, "run", "retained adapter bodies use the same sealed method member");
  assertNoTargetDiagnostics(diagnostics);
});

test("native method-to-delegate admission cannot erase an invocation quantifier", () => {
  const owner = { kind: "target-named", id: "tsonic.shape:quantified-adapter-owner", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "QuantifiedOwner" } };
  const parameter = { kind: "type-parameter", identity: "NativeValue", name: "NativeValue" };
  const contract = csharpDelegateTargetType("System.Func", [parameter], parameter);
  const handle = csharpMethodValueType(owner, "read", "quantified-read", contract, [parameter.identity]);
  assert.equal(handle !== undefined, true, "the quantified native method remains a valid physical callable");
  assert.equal(selectDelegateConversion({}, handle, source) === undefined, true, "ordinary delegates do not erase native quantifiers");
  const admitted = admitCsharpConversionSelection({}, handle, source,
    { kind: "delegate-adapter", strategy: "native-binding", parameterConversions: [], returnConversion: { kind: "void-return" } });
  assert.equal(admitted.kind, "rejected", "forged admission cannot bypass the native quantifier boundary");
});

test("an adapted authored lambda invokes a native local function, never an inner source delegate", () => {
  const observed = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [] };
  const diagnostics = [];
  // The expression planner publishes an authored lambda as a lambda callable; the adapter never inspects the syntax.
  const lambda = { kind: "LambdaExpression", parameters: [], body: observed };
  const planned = planCsharpDelegateAdapter({}, {}, context(), diagnostics, source, target, selection,
    lambda, applyCsharpConversionSelection, { kind: "lambda", expression: lambda });
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "LambdaExpression");
  const [local, invocation, returned] = planned.body.statements;
  assert.equal(local.kind, "LocalFunctionStatement");
  assert.equal(local.body.statements[0].expression, observed);
  assert.equal(invocation.expression.callee.name, local.name);
  assert.equal(returned.expression.kind, "DefaultExpression");
  assert.doesNotMatch(JSON.stringify(planned), /CastExpression/u);
});

test("an adapted fixed self value reuses the exact initialized native slot without a second capture frame", () => {
  const node = {};
  const expression = { kind: "IdentifierName", name: "fixed" };
  const input = context();
  input.program.records.namedSelf.get = declaration => declaration === node ? { values: [{}] } : undefined;
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter(node, {}, input, diagnostics, source, target, selection,
    expression, applyCsharpConversionSelection, { kind: "stable-value" });
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "LambdaExpression");
  assert.equal(planned.body.statements[0].expression.callee === expression, true, "reuse exact fixed local slot");
  for (const changed of [undefined, { values: [] }]) {
    input.program.records.namedSelf.get = () => changed;
    assert.equal(planCsharpDelegateAdapter(node, {}, input, diagnostics, source, target, selection,
      expression, applyCsharpConversionSelection).kind, "SwitchExpression", "mutable or unproven aliases retain snapshot semantics");
  }
  input.program.records.namedSelf.get = () => ({ values: [{}] });
  for (const changed of [
    { kind: "InvocationExpression", callee: expression, arguments: [] },
    { kind: "SimpleMemberAccessExpression", receiver: expression, name: "value" },
  ]) {
    assert.equal(planCsharpDelegateAdapter(node, {}, input, diagnostics, source, target, selection,
      changed, applyCsharpConversionSelection).kind, "SwitchExpression", "effects and mutable member reads cannot use fixed self proof");
  }
  assertNoTargetDiagnostics(diagnostics);
});

test("an adapted captured method binds its sealed native frame, not a source delegate", () => {
  const frame = { kind: "IdentifierName", name: "capturedFrame" };
  const method = { kind: "SimpleMemberAccessExpression", receiver: frame, name: "invoke" };
  const input = context();
  input.program.records.captureClosure.get = () => ({ method: { methodName: "invoke", type: source } });
  const diagnostics = [];
  // The capture planner publishes the frame method as a captured-method callable (capture-closures.ts).
  const planned = planCsharpDelegateAdapter({}, {}, input, diagnostics, source, target, selection, method, applyCsharpConversionSelection,
    { kind: "captured-method", receiver: frame, name: "invoke" });
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression, frame);
  const invocation = planned.arms[0].expression.expression.body.statements[0].expression;
  assert.equal(invocation.callee.name, "invoke");
  assert.equal(invocation.callee.receiver.name, planned.arms[0].pattern.designation);
  for (const captured of [
    { method: { methodName: "other", type: source } },
    { method: { methodName: "invoke", type: target } },
  ]) {
    input.program.records.captureClosure.get = () => captured;
    const unchanged = planCsharpDelegateAdapter({}, {}, input, diagnostics, source, target, selection, method, applyCsharpConversionSelection);
    assert.equal(unchanged.expression.kind, "CastExpression");
    assert.equal(unchanged.expression.expression, method);
  }
  assertNoTargetDiagnostics(diagnostics);
});

test("native adapters reject missing signatures and mismatched conversion arity", () => {
  for (const [from, to, selected] of [
    [undefined, target, selection], [source, undefined, selection],
    [source, target, { ...selection, parameterConversions: [{ kind: "identity" }] }],
    [target, source, selection],
  ]) {
    // The analysis owns the refusal: the selection never becomes an admitted conversion.
    assert.deepEqual(admitCsharpConversionSelection({}, from, to, selected), { kind: "rejected",
      reason: "C# delegate adaptation requires exact renderable source and target signatures." });
    // Without an admitted conversion there is no published contract, and the planner fails closed.
    const diagnostics = [];
    assert.throws(() => planCsharpDelegateAdapter({}, {}, context([]), diagnostics, from, to, selected,
      { kind: "IdentifierName", name: "original" }, applyCsharpConversionSelection),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT");
    assert.equal(diagnostics.length, 0);
  }
});

test("source delegate ABI identity rejects foreign, byref and inconsistent signatures", () => {
  assert.equal(isCsharpSourceDelegateTargetType(source), true);
  assert.equal(isCsharpSourceDelegateTargetType(csharpNullableTargetType(target)), true);
  for (const type of [undefined, { ...source, id: "Provider.Callback" },
    { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, returnPassing: "byref-readwrite" } },
    { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, parameters: [number] } }]) {
    assert.equal(isCsharpSourceDelegateTargetType(type), false);
  }
});

test("exact absence conversion retains an effectful producer and rejects present carriers", () => {
  const effect = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "absent" }, arguments: [] };
  for (const to of [csharpNullableTargetType(number), csharpTsValueTargetType()]) {
    const diagnostics = [];
    const planned = applyCsharpConversionSelection({}, {}, context(), diagnostics, csharpAbsenceTargetType(), to,
      { kind: "absence" }, effect);
    assertNoTargetDiagnostics(diagnostics);
    assert.equal(planned.kind, "SwitchExpression");
    assert.equal(planned.expression.expression, effect);
    assert.equal(planned.arms[0].expression.kind, "DefaultExpression");
  }
  for (const [from, to] of [[number, target], [csharpAbsenceTargetType(), number]]) {
    assert.deepEqual(admitCsharpConversionSelection({}, from, to, { kind: "absence" }), {
      kind: "rejected", reason: "An absence conversion requires its exact source and destination storage contracts.",
    });
  }
});
