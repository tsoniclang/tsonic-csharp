import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpJsValueCall } from "../../../../dist/backend/planner/expressions/calls/js-values.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpTsValueTargetType } from "../../../../dist/target-model/types/index.js";
import { selectCsharpJsValueCallOperation } from "../../../../dist/analysis/operations/js-values.js";
import { validateCsharpJsValueOperationSelection } from "../../../../dist/policy/operations/js-values/selection.js";
import { analyzeCsharpJsCalls } from "../../../../dist/analysis/operations/js-value-call-emission.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

const carrier = csharpTsValueTargetType();
const identifier = name => ({ kind: "IdentifierName", name });
const effect = name => ({ kind: "ExpressionStatement", expression: { kind: "InvocationExpression", callee: identifier(name), arguments: [] } });
const nodes = value => value === null || typeof value !== "object" ? [] : [value, ...Object.values(value).flatMap(nodes)];

function setup(optionalReceiver = false, optionalCall = false, element = false) {
  const receiver = { kind: "receiver" };
  const argument = { kind: "argument" };
  const key = { kind: "key" };
  const member = { kind: "member" };
  const call = { kind: "call" };
  let counter = 0;
  const syntax = {
    is: { IsSpreadElement: () => false },
    arguments: () => [argument],
    pos: () => 1,
    text: () => "call",
    as: {
      AsCallExpression: () => ({ QuestionDotToken: optionalCall ? {} : undefined }),
      AsPropertyAccessExpression: () => ({ name: {}, QuestionDotToken: optionalReceiver ? {} : undefined }),
      AsElementAccessExpression: () => ({ QuestionDotToken: optionalReceiver ? {} : undefined }),
    },
  };
  const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueCallOperation(
    { types: { resolveNode: () => carrier } }, {}, {}, {}, element ? "element" : "property", optionalCall));
  const source = { sourceCallee: { expression: member }, sourceCalleeAccess: {
    kind: element ? "element" : "property", expression: member, receiver: { expression: receiver }, argument: { expression: key },
  } };
  // The analysis publishes the closed call's emission plan from the selected JS-value operation; the planner renders it.
  const analyze = operation => analyzeCsharpJsCalls(syntax, [call], { selectedCall: { get: node => node === call
    ? { form: { kind: "js-value", operation }, source } : undefined } }, () => true);
  const analysis = analyze(selected);
  const input = { program: { source: { ast: syntax }, records: { jsCall: analysis.records.jsCall, typeEmission: csharpTypeEmissionRecord() } },
    scope: {}, names: { temporaryName: () => `local${counter++}` } };
  const plan = subject => csharpPlannedValue(carrier, identifier(subject.kind),
    subject === argument ? [effect("argumentPrelude")] : subject === key ? [effect("keyPrelude")] : []);
  const diagnostics = [];
  return { call, input, selected, source, plan, diagnostics, analyze };
}

test("closed member call acquires original receiver and callee before argument preludes", () => {
  const context = setup();
  const planned = planCsharpJsValueCall(context.call, {}, context.input, context.diagnostics, context.plan);
  assertNoTargetDiagnostics(context.diagnostics);
  assert.equal(planned.prelude[0].kind, "LocalDeclarationStatement");
  assert.deepEqual(planned.prelude[0].initializer, identifier("receiver"));
  assert.equal(planned.prelude[1].initializer.callee.name, "ReadDynamicSlot");
  assert.deepEqual(planned.prelude[2], effect("argumentPrelude"));
  assert.equal(planned.completion.expression.callee.name, "InvokeDynamicWithThis");
  assert.deepEqual(planned.completion.expression.arguments[0].expression, identifier(planned.prelude[0].name));
  assert.equal(nodes(planned).some(node => node.kind === "LambdaExpression"), false);
});

test("optional receiver owns key and argument preludes exclusively inside its native branch", () => {
  const context = setup(true, false, true);
  const planned = planCsharpJsValueCall(context.call, {}, context.input, context.diagnostics, context.plan);
  assertNoTargetDiagnostics(context.diagnostics);
  const branch = planned.prelude.find(statement => statement.kind === "IfStatement");
  assert.ok(branch);
  assert.equal(nodes(branch.condition).some(node => node.name === "isUndefined"), true);
  const thenNodes = nodes(branch.thenBody);
  assert.equal(thenNodes.some(node => node.name === "keyPrelude"), true);
  assert.equal(thenNodes.some(node => node.name === "argumentPrelude"), true);
  assert.equal(nodes(branch.elseBody).some(node => node.name === "keyPrelude" || node.name === "argumentPrelude"), false);
  assert.equal(nodes(planned).some(node => node.kind === "LambdaExpression"), false);
  assert.equal(thenNodes.some(node => node.name === "ReadDynamicElementOptional"), false);
});

test("optional callee is checked after member acquisition and before argument completion", () => {
  const context = setup(false, true);
  const planned = planCsharpJsValueCall(context.call, {}, context.input, context.diagnostics, context.plan);
  assertNoTargetDiagnostics(context.diagnostics);
  const branch = planned.prelude.find(statement => statement.kind === "IfStatement");
  assert.ok(branch);
  assert.equal(nodes(branch.condition).some(node => node.name === "ReadDynamicSlot"), true);
  assert.equal(nodes(branch.thenBody).some(node => node.name === "argumentPrelude"), true);
  assert.equal(nodes(branch.elseBody).some(node => node.name === "argumentPrelude"), false);
  assert.equal(nodes(planned).some(node => node.name === "InvokeDynamicOptional" || node.kind === "LambdaExpression"), false);
});

test("closed call never reconstructs missing finalized counterpart evidence", () => {
  const context = setup(true, true);
  // Missing member-read evidence is refused by the analysis, so no emission plan is published and the planner fails
  // its invariant instead of reconstructing the read.
  const refused = context.analyze({ ...context.selected, receiverReadOperation: undefined });
  assert.equal(refused.issues.length, 1);
  const input = { ...context.input, program: { ...context.input.program, records: { ...context.input.program.records, jsCall: refused.records.jsCall } } };
  assert.throws(() => planCsharpJsValueCall(context.call, {}, input, context.diagnostics, context.plan),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT");
  assert.equal(context.diagnostics.length, 0);
});
