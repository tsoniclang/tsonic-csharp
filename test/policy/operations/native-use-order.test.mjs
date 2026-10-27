import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, sourceSequenceInputChoice } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpNativeOperandUses } from "../../../dist/analysis/operations/control-flow/native-operands.js";
import { selectCsharpNativeCompletion } from "../../../dist/policy/operations/control-flow/native-completion.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

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
  function sourceValues(): number[] | undefined { return undefined; }
  function fallbackValues(): number[] { return [1]; }
  function neverValues(): number[] { throw new Error("unreachable fallback"); }
  export const borrowedValues = [0, ...(sourceValues() ?? fallbackValues() ?? neverValues()), 2];
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
  operations: { selectedCall: { get: node => node === call ? selected : undefined }, nativeHandler: none, borrowedSequence: none },
  valueReads: { valueRead: { get: () => ({ value: scalar }) } }, bindingPatterns: { bindingPatternProjection: none },
  unusedDefault: no, callableCreation: none, optionalLocals: none, classFactories: { classFactory: none },
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

test("a rejected source callee retains its owner refusal before unavailable argument contracts", () => {
  const reason = "The exact selected source callee is external to the project and has no C# target relation.";
  for (const kind of ["refused", "unresolved", "inconsistent"]) {
    const selected = classification({ kind, reason: "Arguments have no native parameter contract." });
    selected.sourceCall = { kind: "rejected", reason };
    const actual = selectCsharpNativeOperandUses(input(selected), call);
    assert.equal(actual.refusal, "operation-unresolved", `${kind}: the callee owner already refused the call`);
    assert.equal(actual.refusalMessage, reason, `${kind}: argument availability cannot replace the callee's exact reason`);
    assert.equal(actual.runtime.length + actual.planning.length, 0, `${kind}: no rejected call operand is admitted`);
  }
});

test("private optional local operands consume their selected physical plan and preserve lazy writes", () => {
  const placement = Object.freeze({ declaration: call, storage: scalar, payload: scalar,
    payloadName: "payload", presenceName: "present" });
  const present = Object.freeze({ kind: "present", expression: argument });
  const absent = Object.freeze({ kind: "absence", expression: argument });
  const copied = Object.freeze({ kind: "copy", expression: argument, placement });
  for (const [label, operation, count, guarded] of [
    ["read", { kind: "read", placement, guarded: false }, 0, false],
    ["guarded read", { kind: "read", placement, guarded: true }, 0, false],
    ["present write", { kind: "write", placement, value: present }, 1, false],
    ["absence write", { kind: "write", placement, value: absent }, 1, false],
    ["copy write", { kind: "write", placement, value: copied }, 0, false],
    ["absence test", { kind: "absence-test", placement, other: argument, localFirst: true, negated: false }, 1, false],
    ["coalescing read", { kind: "coalesce", placement, right: argument, assignment: false }, 1, true],
    ["coalescing write", { kind: "coalesce", placement, right: argument, assignment: true }, 1, true],
  ]) {
    const value = input(undefined);
    value.optionalLocals = { get: node => node === call ? operation : undefined };
    value.operations.nativeHandler = { get: () => assert.fail(label + ": an ordinary handler does not replace the selected local operation") };
    const selected = selectCsharpNativeOperandUses(value, call);
    assert.equal(selected.refusal === undefined, true, label + ": only an admitted local plan selects its native operation");
    assert.equal(selected.runtime.length, count, label + ": the renderer's exact expression inputs are retained");
    assert.equal(selected.planning.length, count, label + ": synthetic local storage has no additional source evaluation");
    assert.equal(selected.runtime.every(child => child.expression === argument), true, label + ": original source input identity is exact");
    assert.equal(selected.runtime.every(child => child.guard === (guarded ? "if-absent" : undefined)), true,
      label + ": fallback evaluation stays guarded by the selected presence");
    assert.equal(selected.planning.every((step, index) => step.use === selected.runtime[index]), true,
      label + ": runtime and planning use the same physical children");
    if (guarded) {
      const completion = selectCsharpNativeCompletion(selected.carrier, { kind: "sequence",
        children: [{ completion: { kind: "never" }, guarded: true }] });
      assert.equal(completion?.kind === (operation.assignment ? "void" : "value"), true,
        label + ": a throwing fallback does not make the present path diverge");
    }
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

test("borrowed sequence demand keeps actual native branches and omits an unreachable fallback", () => {
  const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "borrowedValues");
  const array = ast.as.AsVariableDeclaration(declaration).Initializer;
  const spread = ast.children(array)[1];
  const expression = ast.as.AsSpreadElement(spread).Expression;
  const choice = sourceSequenceInputChoice(ast, expression);
  assert.equal(choice.inputs.length, 3, "all three original source operands are checked before native reachability");
  const carrier = { kind: "array", element: scalar };
  const fact = { expression, array, sourceCarrier: carrier, controlNodes: choice.controlNodes,
    inputs: choice.inputs.map((expression, index) => ({ kind: "sequence", expression,
      carrier: index === 0 ? csharpNullableTargetType(carrier) : carrier, presentCarrier: carrier,
      optional: index === 0, lengthMember: "Length", elements: [scalar] })) };
  const value = input(undefined);
  value.operations.borrowedSequence = { get: node => node === expression ? fact : undefined };
  const selected = selectCsharpNativeOperandUses(value, array);
  assert.deepEqual(selected.runtime.map(child => text(child.expression)), ["0", "sourceValues()", "fallbackValues()", "2"]);
  assert.deepEqual(selected.runtime.map(child => child.guard), [undefined, undefined, "if-absent", undefined]);
  assert.equal(selected.runtime[1].owner === expression && selected.runtime[2].owner === expression &&
    selected.runtime[1].slot.index === 0 && selected.runtime[2].slot.index === 1, true,
  "the selected branches retain their original choice owner and input positions");
  assert.equal(selected.planning.every((step, index) => step.kind === "use" && step.use === selected.runtime[index]), true,
    "planning retains the identical runtime operands and cannot evaluate a fallback twice");
});
