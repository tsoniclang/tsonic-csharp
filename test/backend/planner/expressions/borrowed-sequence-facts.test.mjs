import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpBorrowedSequenceConsumption } from "../../../../dist/backend/planner/expressions/array-literals/borrowed-sequences.js";
import { planCsharpBorrowedDenseSequence } from "../../../../dist/backend/planner/expressions/array-literals/borrowed-dense.js";
import { planCsharpJsArraySpreadAppend } from "../../../../dist/backend/planner/expressions/sequence-conversions.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpNullableTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType,
  csharpNeverTargetType, csharpVoidTargetType, targetTypeRefEquals } from "../../../../dist/target-model/types/index.js";

const string = csharpStringTargetType();
const int32 = csharpSourcePrimitiveTargetType("int32");
const sequence = { kind: "array", element: string };

function fixture(destination = string, completion) {
  const source = { kind: "Identifier", position: 1 };
  const empty = { kind: "ArrayLiteral", position: 2 };
  const expression = { kind: "Binary", Left: source, Right: empty };
  const spread = { kind: "Spread", Expression: expression };
  const array = { kind: "ArrayLiteral", elements: [spread] };
  const parent = new Map([[source, expression], [empty, expression], [expression, spread], [spread, array]]);
  const ast = {
    parent: node => parent.get(node), pos: node => node.position ?? 0,
    operatorKindName: () => "KindQuestionQuestionToken", elements: node => node.elements ?? [],
    is: { IsParenthesizedExpression: () => false, IsSatisfiesExpression: () => false,
      IsBinaryExpression: node => node.kind === "Binary", IsArrayLiteralExpression: node => node.kind === "ArrayLiteral" },
    as: { AsBinaryExpression: node => node },
  };
  const optional = csharpNullableTargetType(sequence);
  const fact = { expression, array, sourceCarrier: { kind: "array", element: destination }, controlNodes: [expression], inputs: [
    { kind: "sequence", expression: source, carrier: optional, presentCarrier: sequence,
      optional: true, lengthMember: "Length", elements: [string] },
    { kind: "empty", expression: empty },
  ] };
  const pairs = [];
  const input = { program: { source: { ast },
    expectedTypes: { forExpression: () => [], arrayLiteralCarrier: () => undefined },
    conversions: { select(from, to, mode) {
    pairs.push([from, to, mode]);
    return targetTypeRefEquals(from, to) ? { kind: "identity" } : { kind: "rejected", reason: "No selected native conversion." };
  } } }, types: { classifications: { resolveNode(node) { return node === array ? { kind: "array", element: destination } : optional; } } },
    scope: {}, names: { temporaryName: name => name } };
  const diagnostics = [];
  const consumed = [];
  const statements = () => planCsharpBorrowedSequenceConsumption(spread, fact, {}, input, diagnostics, destination,
    () => ({ prelude: [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "evaluate_source" } }],
      completion: completion ?? { kind: "value", carrier: optional, expression: { kind: "IdentifierName", name: "source" } } }),
    selected => { consumed.push(selected); return [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "consume_selected" } }]; },
    () => []);
  return { fact, statements, diagnostics, pairs, consumed, string, int32, input, spread, source, empty, array, optional };
}

test("borrowed sequence fragments consume only sealed exact element pairs in the selected native branch", () => {
  const state = fixture();
  const planned = state.statements();
  const statements = planned.prelude;
  assert.equal(planned.completion.kind, "void");
  assert.equal(statements[0].expression.name, "evaluate_source");
  assert.equal(statements[1].kind, "IfStatement");
  assert.equal(statements[1].thenBody.statements[0].expression.name, "consume_selected");
  assert.deepEqual(statements[1].elseBody.statements, []);
  assert.deepEqual(state.pairs, [[string, string, "implicit"]]);
  assert.equal(state.consumed[0].elements[0].conversion.kind, "identity");
  assert.deepEqual(state.diagnostics, []);
});

test("borrowed consumption preserves canonical never completion and cannot consume a void completion", () => {
  const never = fixture(string, { kind: "never", carrier: csharpNeverTargetType() });
  const planned = never.statements();
  assert.equal(planned.completion.kind, "never");
  assert.equal(planned.prelude.length, 1);
  assert.equal(never.consumed.length, 0);
  const absent = fixture(string, { kind: "void", carrier: csharpVoidTargetType() });
  assert.equal(absent.statements(), undefined);
  assert.equal(absent.consumed.length, 0);
  assert.equal(absent.diagnostics.length, 1);
});

test("mutated destination, element evidence and fabricated identity cannot bypass the sealed pair owner", () => {
  const destination = fixture();
  destination.fact.sourceCarrier = { kind: "array", element: int32 };
  assert.equal(destination.statements(), undefined);
  assert.equal(destination.pairs.length, 0);
  const element = fixture();
  element.fact.inputs[0].elements = [int32];
  assert.equal(element.statements(), undefined);
  assert.equal(element.pairs.length, 0);
  const fabricated = fixture(int32);
  fabricated.fact.inputs[0].conversion = { kind: "identity" };
  assert.equal(fabricated.statements(), undefined);
  assert.deepEqual(fabricated.pairs, [[string, int32, "implicit"]]);
  assert.equal(fabricated.consumed.length, 0);
for (const state of [destination, element, fabricated]) assert.equal(state.diagnostics.length, 1);
});

test("borrowed construction admits only the sealed contextual destination without confusing source storage", () => {
  const state = fixture();
  const contextual = { kind: "array", element: int32 };
  state.input.program.conversions.select = (from, to, mode) => {
    state.pairs.push([from, to, mode]);
    return { kind: "rejected", reason: "No selected native conversion." };
  };
  const consume = () => planCsharpBorrowedSequenceConsumption(state.spread, state.fact, {}, state.input,
    state.diagnostics, int32, () => csharpPlannedValue(state.optional, { kind: "IdentifierName", name: "source" }),
    () => [], () => []);
  assert.equal(consume(), undefined);
  assert.equal(state.pairs.length, 0);
  state.input.program.expectedTypes = {
    forExpression: node => node === state.array ? [contextual] : [],
    arrayLiteralCarrier: (node, target) => node === state.array && target === contextual ? contextual : undefined,
  };
  assert.equal(consume(), undefined);
  assert.deepEqual(state.pairs, [[string, int32, "implicit"]]);
  assert.equal(state.diagnostics.length, 2);
});

test("borrowed source facts cannot be reused for a different array construction", () => {
  const state = fixture();
  state.fact.array = {};
  assert.equal(state.statements(), undefined);
  assert.equal(state.pairs.length, 0);
  assert.equal(state.diagnostics.length, 1);
});

test("borrowed dense selection allocates its sole destination inside the selected branch", () => {
  const state = fixture();
  const planned = planCsharpBorrowedDenseSequence(state.array, state.fact, {}, state.input, state.diagnostics,
    { kind: "PredefinedType", name: "string" }, string,
    () => csharpPlannedValue(state.optional, { kind: "IdentifierName", name: "source" }));
  assert.equal(planned.completion.kind, "value");
  assert.deepEqual(planned.completion.carrier, sequence);
  assert.equal(planned.prelude[0].kind, "LocalDeclarationStatement");
  assert.equal(planned.prelude[0].initializer, undefined);
  const selected = planned.prelude[1];
  assert.equal(selected.kind, "IfStatement");
  assert.equal(selected.thenBody.statements[0].expression.right.kind, "ArrayCreationExpression");
  assert.equal(selected.thenBody.statements[1].expression.callee.name, "Copy");
  assert.equal(selected.elseBody.statements.length, 1);
  assert.equal(selected.elseBody.statements[0].expression.right.size.value, 0);
  assert.doesNotMatch(JSON.stringify(planned), /generated|Func|ForEach|IEnumerable|ObjectCreation|Lambda|ToArray/u);
  assert.deepEqual(state.diagnostics, []);
});

test("borrowed JS append uses the sealed operand query and skips empty-source construction", () => {
  const state = fixture();
  const queried = [];
  state.input.program.operations = { borrowedSequence(node) { queried.push(node); return state.fact; } };
  const planExpression = () => csharpPlannedValue(state.optional, { kind: "IdentifierName", name: "source" },
    [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "evaluate_source" } }]);
  const planned = planCsharpJsArraySpreadAppend(state.spread, state.fact.expression,
    csharpPlannedValue(sequence, { kind: "IdentifierName", name: "destination" },
      [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "evaluate_destination" } }]),
    { kind: "IdentifierName", name: "NativeDenseCollection" }, string, {}, state.input, state.diagnostics, { planExpression });
  assert.deepEqual(queried, [state.fact.expression]);
  assert.equal(planned.prelude[0].expression.name, "evaluate_destination");
  assert.equal(planned.prelude[1].initializer.name, "destination");
  assert.equal(planned.prelude[2].expression.name, "evaluate_source");
  const branch = planned.prelude[3];
  assert.equal(branch.kind, "IfStatement");
  assert.deepEqual(branch.elseBody.statements, []);
  assert.equal(branch.thenBody.statements[0].expression.callee.name, "EnsureCapacity");
  assert.doesNotMatch(JSON.stringify(planned), /ArrayCreation|ObjectCreation|generated|Func|Lambda|ToArray/u);
  assert.deepEqual(state.diagnostics, []);
});

test("borrowed branch composition keeps an effectful fallback in the selected native else region", () => {
  const state = fixture();
  state.empty.kind = "Identifier";
  state.fact.inputs[1] = { kind: "sequence", expression: state.empty, carrier: sequence,
    presentCarrier: sequence, optional: false, lengthMember: "Length", elements: [string] };
  state.input.types.classifications.resolveNode = node => node === state.array ? sequence : node === state.source ? state.optional : sequence;
  const planned = planCsharpBorrowedDenseSequence(state.array, state.fact, {}, state.input, state.diagnostics,
    { kind: "PredefinedType", name: "string" }, string, node => node === state.source
      ? csharpPlannedValue(state.optional, { kind: "IdentifierName", name: "source" })
      : csharpPlannedValue(sequence, { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "fallback" }, arguments: [] },
        [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "fallback_effect" } }]));
  const branch = planned.prelude[1];
  assert.equal(branch.kind, "IfStatement");
  assert.equal(branch.elseBody.statements[0].expression.name, "fallback_effect");
  assert.equal(branch.elseBody.statements[1].initializer.callee.name, "fallback");
  assert.doesNotMatch(JSON.stringify(branch.thenBody), /fallback/u);
  assert.deepEqual(state.diagnostics, []);
});
