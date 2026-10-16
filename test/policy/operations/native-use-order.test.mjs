import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpNativeOperandUses } from "../../../dist/policy/operations/native-demand/operands.js";
import { selectCsharpNativeCompletion } from "../../../dist/policy/operations/native-demand/completion.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "int32" });
const checked = checkCsharpSource({ sourceText: `
  function argument(): number { return 1; }
  function receiver(): { method: (value: number) => number } { return { method: value => value }; }
  export const called = receiver().method(argument());
  export const callback = () => argument();
` });
assert.equal(checked.sourceDiagnosticsText === "", true, checked.sourceDiagnosticsText);
const source = createTargetSourceProgram(checked.source);
const ast = source.ast;
const nodes = [];
const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
for (const file of source.sourceFiles) walk(file);
const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim();
const call = nodes.find(node => ast.is.IsCallExpression(node) && text(node) === "receiver().method(argument())");
const member = ast.as.AsPropertyAccessExpression(ast.as.AsCallExpression(call).Expression);
const argument = ast.arguments(call)[0];
const receiver = member.Expression;
const none = { get: () => undefined };
const no = { get: () => false };
const record = { sourceArgumentIndex: 0, effectiveArgumentIndex: 0, sourceParameterIndex: 0, parameterIndex: 0,
  expression: argument, sourceForm: "value", type: scalar };
const classification = grouping => ({ form: { kind: "target", optionalReceiverRouting: "call" },
  target: { kind: "source-owned" }, source: { sourceCalleeAccess: { kind: "property", receiver: { expression: receiver } } },
  sourceCall: { kind: "method", receiver: { expression: receiver, type: scalar } }, unionCall: { kind: "not-union" },
  sourceArgumentGrouping: grouping });
const input = selected => ({ ast, evidence: { compileTimeMetadata: no, sourceArgument: none, sourceDefaultValue: none },
  operations: { selectedCall: { get: node => node === call ? selected : undefined }, nativeHandler: none },
  valueReads: { valueRead: { get: () => ({ value: scalar }) } }, bindingPatterns: { bindingPatternProjection: none },
  unusedDefault: no, callableCreation: none, classFactories: { classFactory: none },
  navigation: { sourceReferenceFor: () => undefined, referenceFor: () => undefined, isProjectDeclaration: () => false } });

test("source method runtime order differs from planning order without a copied argument binder", () => {
  const selected = selectCsharpNativeOperandUses(input(classification({ kind: "grouped", arguments: [record], groups: [] })), call);
  assert.equal(selected.refusal === undefined, true);
  assert.deepEqual(selected.runtime.map(use => text(use.expression)), ["receiver()", "argument()"]);
  assert.deepEqual(selected.planning.map(step => text(step.use.expression)), ["argument()", "receiver()"]);
  const slot = selected.runtime[1].slot;
  assert.equal(slot.sourceIndex === 0 && slot.effectiveIndex === 0 && slot.parameterIndex === 0 && slot.sourceParameterIndex === 0, true);
  for (const kind of ["refused", "unresolved", "inconsistent"]) {
    const refused = selectCsharpNativeOperandUses(input(classification({ kind, reason: kind })), call);
    assert.equal(refused.refusal, `argument-${kind}`);
    assert.equal(refused.runtime.length + refused.planning.length, 0, `${kind}: no accepted prefix or positional fallback`);
  }
});

test("a selected native handler owns the runtime operands without asking the losing call path", () => {
  const value = input(undefined);
  value.operations.nativeHandler = { get: node => node === call ? { kind: "memory-binding", selection: { kind: "field", type: scalar, expression: argument } } : undefined };
  value.operations.selectedCall = { get: () => assert.fail("losing selected-call reader") };
  value.operations.memoryBinding = { get: () => assert.fail("raw native applicability reader") };
  const selected = selectCsharpNativeOperandUses(value, call);
  assert.equal(selected.refusal === undefined && selected.runtime.length === 1 && selected.runtime[0].expression === argument &&
    selected.runtime[0].slot.kind === "intrinsic-operand" && selected.runtime[0].slot.operand === "value", true);
});

test("callable bodies have compilation work but never become creation-time runtime operands", () => {
  const arrow = nodes.find(node => ast.is.IsArrowFunction(node) && text(node) === "() => argument()");
  const value = input(undefined);
  value.callableCreation = { get: () => ({ kind: "selected", carrier: scalar }) };
  const selected = selectCsharpNativeOperandUses(value, arrow);
  assert.equal(selected.flow === "creation" && selected.runtime.length === 0 && selected.planning.length === 1 &&
    selected.planning[0].kind === "construct" && selected.planning[0].node === arrow, true);
});

test("completion distinguishes mandatory, alternative, guarded and creation-time dependencies", () => {
  const normal = Object.freeze({ kind: "value", type: scalar });
  const never = Object.freeze({ kind: "never" });
  for (const [label, flow, kind] of [
    ["mandatory never", { kind: "sequence", children: [{ completion: never }, { completion: undefined }] }, "never"],
    ["unknown before never", { kind: "sequence", children: [{ completion: undefined }, { completion: never }] }, undefined],
    ["optional default never", { kind: "sequence", children: [{ completion: never, guarded: true }] }, "value"],
    ["one branch never", { kind: "conditional", condition: normal, whenTrue: never, whenFalse: normal }, "value"],
    ["both branches never", { kind: "conditional", condition: normal, whenTrue: never, whenFalse: never }, "never"],
    ["condition never", { kind: "conditional", condition: never, whenTrue: undefined, whenFalse: undefined }, "never"],
    ["short-circuit right never", { kind: "short-circuit", left: normal, right: never }, "value"],
    ["creation does not execute body", { kind: "creation" }, "value"],
  ]) assert.equal(selectCsharpNativeCompletion(scalar, flow)?.kind, kind, label);
});
