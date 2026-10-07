import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpDelegateAdapter } from "../../../../dist/backend/planner/expressions/delegate-adapters.js";
import { applyCsharpConversionSelection } from "../../../../dist/backend/planner/expressions/conversions.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/runtime-carriers.js";
import { csharpDelegateTargetType, isCsharpSourceDelegateTargetType } from "../../../../dist/target-model/types/delegates.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";

const number = csharpSourcePrimitiveTargetType("float64");
const source = csharpDelegateTargetType("System.Action", []);
const target = csharpDelegateTargetType("System.Func", [number], csharpNullableTargetType(number));
const selection = { kind: "delegate-adapter", strategy: "adaptation", parameterConversions: [], returnConversion: { kind: "void-return" } };

function context() {
  const allocated = new Set();
  return { scope: {}, program: {
    conversions: { directCallableReference: () => undefined },
    captureStorage: { closure: () => undefined },
  }, names: { temporaryName(preferred) {
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

test("an adapted authored lambda invokes a native local function, never an inner source delegate", () => {
  const observed = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter({}, {}, context(), diagnostics, source, target, selection,
    { kind: "LambdaExpression", parameters: [], body: observed }, applyCsharpConversionSelection);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "LambdaExpression");
  const [local, invocation, returned] = planned.body.statements;
  assert.equal(local.kind, "LocalFunctionStatement");
  assert.equal(local.body.statements[0].expression, observed);
  assert.equal(invocation.expression.callee.name, local.name);
  assert.equal(returned.expression.kind, "DefaultExpression");
  assert.doesNotMatch(JSON.stringify(planned), /CastExpression/u);
});

test("an adapted captured method binds its sealed native frame, not a source delegate", () => {
  const frame = { kind: "IdentifierName", name: "capturedFrame" };
  const method = { kind: "SimpleMemberAccessExpression", receiver: frame, name: "invoke" };
  const input = context();
  input.program.captureStorage.closure = () => ({ method: { methodName: "invoke", type: source } });
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter({}, {}, input, diagnostics, source, target, selection, method, applyCsharpConversionSelection);
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
    input.program.captureStorage.closure = () => captured;
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
    const diagnostics = [];
    assert.equal(planCsharpDelegateAdapter({}, {}, context(), diagnostics, from, to, selected,
      { kind: "IdentifierName", name: "original" }, applyCsharpConversionSelection), undefined);
    assert.equal(diagnostics.length, 1);
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
    const diagnostics = [];
    assert.equal(applyCsharpConversionSelection({}, {}, context(), diagnostics, from, to,
      { kind: "absence" }, effect), undefined);
    assert.equal(diagnostics.length, 1);
  }
});
