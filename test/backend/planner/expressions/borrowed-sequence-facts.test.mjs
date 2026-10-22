import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpBorrowedSequenceConsumption } from "../../../../dist/backend/planner/expressions/array-literals/borrowed-sequences.js";
import { planCsharpBorrowedDenseSequence } from "../../../../dist/backend/planner/expressions/array-literals/borrowed-dense.js";
import { planCsharpJsArraySpreadAppend } from "../../../../dist/backend/planner/expressions/sequence-conversions.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpNeverTargetType, csharpVoidTargetType } from "../../../../dist/target-model/types/index.js";
import { compiledCsharpPlanContext } from "../../../helpers/plan-context.mjs";

const string = csharpStringTargetType();
const int32 = csharpSourcePrimitiveTargetType("int32");
const identifier = name => ({ kind: "IdentifierName", name });
const effect = name => ({ kind: "ExpressionStatement", expression: identifier(name) });
const plannerInvariant = message => error => error instanceof Error && error.phase === "planning" && error.message === message;

// The borrowed spread choice the analysis seals for a real compiled array literal (records.borrowedSequence and
// records.borrowedSequenceEmission), with the planning context the planner builds from the sealed program.
function borrowed(surface = "native", operandText = "(authored ?? [])") {
  const state = compiledCsharpPlanContext(`
    export function choose(authored: string[] | undefined): string[] { return [...(authored ?? [])]; }
    export function chooseLazy(authored: string[] | undefined, fallback: () => string[]): string[] { return [...(authored ?? fallback())]; }
  `, surface);
  const operand = state.find("KindParenthesizedExpression", operandText);
  const spread = state.ast.parent(operand);
  const array = state.ast.parent(spread);
  const fact = state.program.records.borrowedSequence.get(operand);
  assert.equal(fact !== undefined, true, "the analysis seals the borrowed choice of the spread operand");
  const source = fact.inputs[0];
  assert.equal(source.kind === "sequence" && source.optional, true, "the authored operand is the optional sequence input");
  return { ...state, operand, spread, array, fact, file: state.sourceFile(operand), diagnostics: [],
    planSource: (prelude = [effect("evaluate_source")]) => () => csharpPlannedValue(source.carrier, identifier("source"), prelude) };
}

test("borrowed sequence fragments consume only sealed exact element pairs in the selected native branch", () => {
  const state = borrowed();
  const consumed = [];
  const planned = planCsharpBorrowedSequenceConsumption(state.spread, state.fact, state.file, state.input, state.diagnostics, string,
    state.planSource(), selected => { consumed.push(selected); return [effect("consume_selected")]; }, () => []);
  const statements = planned.prelude;
  assert.equal(planned.completion.kind, "void");
  assert.equal(statements[0].expression.name, "evaluate_source");
  assert.equal(statements[1].kind, "IfStatement");
  assert.equal(statements[1].thenBody.statements[0].expression.name, "consume_selected");
  assert.deepEqual(statements[1].elseBody.statements, []);
  assert.equal(consumed[0].elements[0].conversion.kind, "identity", "the sealed element pair is the exact string identity");
  assertNoTargetDiagnostics(state.diagnostics);
});

test("borrowed consumption preserves canonical never completion and cannot consume a void completion", () => {
  const state = borrowed();
  const consumed = [];
  const never = planCsharpBorrowedSequenceConsumption(state.spread, state.fact, state.file, state.input, state.diagnostics, string,
    () => ({ prelude: [effect("evaluate_source")], completion: { kind: "never", carrier: csharpNeverTargetType() } }),
    selected => { consumed.push(selected); return []; }, () => []);
  assert.equal(never.completion.kind, "never");
  assert.equal(never.prelude.length, 1);
  assert.equal(consumed.length, 0);
  assert.throws(() => planCsharpBorrowedSequenceConsumption(state.spread, state.fact, state.file, state.input, state.diagnostics, string,
    () => ({ prelude: [], completion: { kind: "void", carrier: csharpVoidTargetType() } }),
    selected => { consumed.push(selected); return []; }, () => []),
  plannerInvariant("An admitted sequence requires a value completion."));
  assert.equal(consumed.length, 0);
  assertNoTargetDiagnostics(state.diagnostics);
});

test("a destination or source choice without its sealed consumption plan cannot bypass the pair owner", () => {
  const state = borrowed();
  const plan = (fact, destination) => () => planCsharpBorrowedSequenceConsumption(state.spread, fact, state.file, state.input,
    state.diagnostics, destination, state.planSource(), () => assert.fail("no unsealed pair is consumed"), () => []);
  const missing = plannerInvariant("An admitted borrowed sequence requires its exact native consumption plan.");
  assert.throws(plan(state.fact, int32), missing, "another destination element has no sealed plan");
  assert.throws(plan({ ...state.fact, inputs: [{ ...state.fact.inputs[0], elements: [int32] }, state.fact.inputs[1]] }, string), missing,
    "a fabricated element choice is not the sealed choice");
  assertNoTargetDiagnostics(state.diagnostics);
});

test("borrowed dense selection allocates its sole destination inside the selected branch", () => {
  const state = borrowed();
  const planned = planCsharpBorrowedDenseSequence(state.array, state.fact, state.file, state.input, state.diagnostics,
    { kind: "PredefinedType", name: "string" }, string, state.planSource([]));
  assert.equal(planned.completion.kind, "value");
  assert.equal(planned.prelude[0].kind, "LocalDeclarationStatement");
  assert.equal(planned.prelude[0].initializer, undefined);
  const selected = planned.prelude[1];
  assert.equal(selected.kind, "IfStatement");
  assert.equal(selected.thenBody.statements[0].expression.right.kind, "ArrayCreationExpression");
  assert.equal(selected.thenBody.statements[1].expression.callee.name, "Copy");
  assert.equal(selected.elseBody.statements.length, 1);
  assert.equal(selected.elseBody.statements[0].expression.right.size.value, 0);
  assert.doesNotMatch(JSON.stringify(planned), /generated|Func|ForEach|IEnumerable|ObjectCreation|Lambda|ToArray/u);
  assertNoTargetDiagnostics(state.diagnostics);
});

test("borrowed JS append uses the sealed operand query and skips empty-source construction", () => {
  const state = borrowed("js");
  const planExpression = state.planSource();
  const planned = planCsharpJsArraySpreadAppend(state.spread, state.operand,
    csharpPlannedValue(state.fact.sourceCarrier, identifier("destination"), [effect("evaluate_destination")]),
    { kind: "IdentifierName", name: "NativeDenseCollection" }, string, state.file, state.input, state.diagnostics, { planExpression });
  assert.equal(planned.prelude[0].expression.name, "evaluate_destination");
  assert.equal(planned.prelude[1].initializer.name, "destination");
  assert.equal(planned.prelude[2].expression.name, "evaluate_source");
  const branch = planned.prelude[3];
  assert.equal(branch.kind, "IfStatement");
  assert.deepEqual(branch.elseBody.statements, []);
  assert.equal(branch.thenBody.statements[0].expression.callee.name, "EnsureCapacity");
  assert.doesNotMatch(JSON.stringify(planned), /ArrayCreation|ObjectCreation|generated|Func|Lambda|ToArray/u);
  assertNoTargetDiagnostics(state.diagnostics);
});

test("borrowed branch composition keeps an effectful fallback in the selected native else region", () => {
  const state = borrowed("native", "(authored ?? fallback())");
  const fallback = state.fact.inputs[1];
  assert.equal(fallback.kind === "sequence" && !fallback.optional, true, "the fallback call is the required sequence input");
  const planned = planCsharpBorrowedDenseSequence(state.array, state.fact, state.file, state.input, state.diagnostics,
    { kind: "PredefinedType", name: "string" }, string, node => node === state.fact.inputs[0].expression
      ? csharpPlannedValue(state.fact.inputs[0].carrier, identifier("source"))
      : csharpPlannedValue(fallback.carrier, { kind: "InvocationExpression", callee: identifier("fallback"), arguments: [] },
        [effect("fallback_effect")]));
  const branch = planned.prelude[1];
  assert.equal(branch.kind, "IfStatement");
  assert.equal(branch.elseBody.statements[0].expression.name, "fallback_effect");
  assert.equal(branch.elseBody.statements[1].initializer.callee.name, "fallback");
  assert.doesNotMatch(JSON.stringify(branch.thenBody), /fallback/u);
  assertNoTargetDiagnostics(state.diagnostics);
});
