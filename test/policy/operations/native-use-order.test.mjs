import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpNativeOperandUses } from "../../../dist/policy/operations/control-flow/native-operands.js";
import { selectCsharpNativeCompletion } from "../../../dist/policy/operations/control-flow/native-completion.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "int32" });
const checked = checkCsharpSource({ sourceText: `
  function argument(): number { return 1; }
  function receiver(): { method: (value: number) => number } { return { method: value => value }; }
  export const called = receiver().method(argument());
  export const callback = () => argument();
  class Box { value = 1; }
  export const constructed = new Box();
  export const indexed = [1][0];
  function first(): number { return 1; }
  function tail(): { continued: number } { return { continued: 2 }; }
  function body(): number { return 3; }
  function last(): number { return 4; }
  const short = 9;
  export const ordered = { a: first(), ...tail(), m() { return body(); }, z: last() };
  export const shorthandOrdered = { a: first(), short, ...tail(), m() { return body(); }, z: last() };
  export const accessorOrdered = { a: first(), get measured(): number { return body(); },
    set measured(value: number) { void value; }, z: last() };
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
  target: { kind: "source-owned" }, source: { sourceCallee: { expression: member },
    sourceCalleeAccess: { kind: "property", receiver: { expression: receiver } } },
  sourceCall: { kind: "method", receiver: { expression: receiver, type: scalar } }, unionCall: { kind: "not-union" },
  sourceArgumentGrouping: grouping });
const input = selected => ({ ast, evidence: { compileTimeMetadata: no, sourceArgument: none, sourceDefaultValue: none },
  operations: { selectedCall: { get: node => node === call ? selected : undefined }, nativeHandler: none },
  valueReads: { valueRead: { get: () => ({ value: scalar }) } }, bindingPatterns: { bindingPatternProjection: none },
  unusedDefault: no, callableCreation: none, classFactories: { classFactory: none },
  navigation: { sourceReferenceFor: () => undefined, referenceFor: () => undefined, isProjectDeclaration: () => false } });

test("source method runtime order differs from planning order without a copied argument binder", () => {
  const selected = selectCsharpNativeOperandUses(input(classification({ kind: "grouped", arguments: [record], groups: [] })), call);
  assert.equal(selected.refusal === undefined, true, "native-use-order:42: selected.refusal === undefined");
  assert.deepEqual(selected.runtime.map(use => text(use.expression)), ["receiver()", "argument()"], "native-use-order:43: selected.runtime.map(use => text(use.expression))");
  assert.deepEqual(selected.planning.map(step => text(step.use.expression)), ["argument()", "receiver()"], "native-use-order:44: selected.planning.map(step => text(step.use.expression))");
  const slot = selected.runtime[1].slot;
  assert.equal(slot.sourceIndex === 0 && slot.effectiveIndex === 0 && slot.parameterIndex === 0 && slot.sourceParameterIndex === 0, true, "native-use-order:46: slot.sourceIndex === 0 && slot.effectiveIndex === 0 && slot.parameterIndex === 0 && slot.s");
  for (const kind of ["refused", "unresolved", "inconsistent"]) {
    const refused = selectCsharpNativeOperandUses(input(classification({ kind, reason: kind })), call);
    assert.equal(refused.refusal, `argument-${kind}`, "native-use-order:49: refused.refusal");
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
    selected.runtime[0].slot.kind === "intrinsic-operand" && selected.runtime[0].slot.operand === "value", true, "native-use-order:61: selected.refusal === undefined && selected.runtime.length === 1 && selected.runtime[0].exp");
});

for (const [label, kind, expression, family] of [
  ["call", "IsCallExpression", "receiver().method(argument())", "selectedCall"],
  ["construction", "IsNewExpression", "new Box()", "selectedConstruction"],
  ["property", "IsPropertyAccessExpression", "receiver().method", "selectedProperty"],
  ["element", "IsElementAccessExpression", "[1][0]", "selectedElement"],
]) test(`the winning ${label} source refusal carries the identical extension diagnostic`, () => {
  const node = nodes.find(candidate => ast.is[kind](candidate) && text(candidate) === expression);
  assert.equal(node !== undefined, true, `${label}: the original checked operation exists`);
  const diagnostic = Object.freeze({ extensionId: "test-source-policy", extensionCode: "EXACT_SELECTED_REFUSAL",
    publicCode: "NOT_THE_CANONICAL_TARGET_CODE", numericCode: 9101001, category: "error",
    message: `The selected ${label} requires its exact native relation.`, nodeOrSpan: node,
    evidence: Object.freeze([Object.freeze({ message: "The actual selected native relation is absent." })]) });
  const target = Object.freeze({ kind: "rejected", diagnostic });
  const selected = label === "call" ? { form: { kind: "target" }, target }
    : label === "construction" || label === "element" ? { jsValue: { kind: "not-js-value" }, target }
    : { selection: target };
  const value = input(undefined);
  value.operations[family] = { get: candidate => candidate === node ? selected : undefined };
  const refusal = selectCsharpNativeOperandUses(value, node);
  assert.equal(refusal.sourceDiagnostic === diagnostic && refusal.runtime.length === 0 && refusal.planning.length === 0, true,
    `${label}: the winning diagnostic, source identity and evidence are transported without re-selection`);
  value.operations.nativeHandler = { get: candidate => candidate === node
    ? { kind: "memory-binding", selection: { kind: "field", type: scalar, expression: argument } } : undefined };
  value.operations[family] = { get: () => assert.fail(`${label}: losing source-selection reader`) };
  const winner = selectCsharpNativeOperandUses(value, node);
  assert.equal(winner.refusal === undefined && winner.sourceDiagnostic === undefined && winner.runtime.length === 1 &&
    winner.runtime[0].expression === argument, true, `${label}: a native handler never probes or publishes a losing source refusal`);
});

test("callable bodies have compilation work but never become creation-time runtime operands", () => {
  const arrow = nodes.find(node => ast.is.IsArrowFunction(node) && text(node) === "() => argument()");
  const value = input(undefined);
  value.callableCreation = { get: () => ({ kind: "selected", carrier: scalar }) };
  const selected = selectCsharpNativeOperandUses(value, arrow);
  assert.equal(selected.flow === "creation" && selected.runtime.length === 0 && selected.planning.length === 1 &&
    selected.planning[0].kind === "construct" && selected.planning[0].node === arrow, true, "native-use-order:70: selected.flow === \"creation\" && selected.runtime.length === 0 && selected.planning.length ");
});

for (const example of [
  { name: "ordered", runtime: ["first()", "tail()", "last()"], slots: [0, 1, 3],
    planning: ["use:0", "use:1", "construct:2", "use:3"] },
  { name: "shorthandOrdered", runtime: ["first()", "short", "tail()", "last()"], slots: [0, 1, 2, 4],
    planning: ["use:0", "use:1", "use:2", "construct:3", "use:4"] },
  { name: "accessorOrdered", runtime: ["first()", "last()"], slots: [0, 3],
    planning: ["use:0", "construct:1", "construct:2", "use:3"] },
]) test(`shared object member rows retain original identity and native construct interleave (${example.name})`, () => {
  const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === example.name);
  const object = ast.as.AsVariableDeclaration(declaration)?.Initializer;
  assert.equal(object !== undefined && ast.is.IsObjectLiteralExpression(object), true,
    `${example.name}: the actual checked object initializer exists`);
  const selected = selectCsharpNativeOperandUses(input(undefined), object);
  assert.equal(selected.refusal === undefined && selected.flow === "sequence", true,
    `${example.name}: the retained object policy selects the same sequence`);
  assert.deepEqual(selected.runtime.map(child => text(child.expression)), example.runtime,
    `${example.name}: runtime operands preserve property, shorthand and spread source order`);
  assert.equal(selected.runtime.every(child => child.owner === object && child.slot.kind === "member"), true,
    `${example.name}: every runtime row keeps the original object owner and member slot`);
  assert.deepEqual(selected.runtime.map(child => child.slot.index), example.slots,
    `${example.name}: method and accessor positions never renumber source member indexes`);
  const members = ast.children(object);
  assert.deepEqual(selected.planning.map(step => step.kind === "use" ? `use:${step.use.slot.index}`
    : `construct:${members.indexOf(step.node)}`), example.planning,
  `${example.name}: native method and accessor constructs retain their exact use/construct interleave`);
  const plannedUses = selected.planning.filter(step => step.kind === "use");
  assert.equal(plannedUses.length === selected.runtime.length && plannedUses.every((step, index) => step.use === selected.runtime[index]), true,
    `${example.name}: planning reuses the identical runtime child objects and cannot execute an operand twice`);
  assert.equal(selected.planning.filter(step => step.kind === "construct").every(step =>
    members.includes(step.node) && (ast.is.IsMethodDeclaration(step.node) || ast.is.IsGetAccessorDeclaration(step.node) || ast.is.IsSetAccessorDeclaration(step.node))), true,
  `${example.name}: only the original native method/accessor declarations are construct work`);
  assert.equal(selected.runtime.some(child => text(child.expression) === "body()"), false,
    `${example.name}: creating the object never executes a method or accessor body`);
  assert.equal(Object.isFrozen(selected.runtime) && selected.runtime.every(child => Object.isFrozen(child) && Object.isFrozen(child.slot)), true,
    `${example.name}: the selected occurrence rows and slots remain immutable`);
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
