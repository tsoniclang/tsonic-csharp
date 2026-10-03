import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpBorrowedSequenceConsumption } from "../../../../dist/backend/planner/expressions/array-literals/borrowed-sequences.js";
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
  const fact = { expression, elementTarget: destination, controlNodes: [expression], inputs: [
    { kind: "sequence", expression: source, carrier: optional, presentCarrier: sequence,
      optional: true, lengthMember: "Length", elements: [string] },
    { kind: "empty", expression: empty },
  ] };
  const pairs = [];
  const input = { program: { source: { ast }, conversions: { select(from, to, mode) {
    pairs.push([from, to, mode]);
    return targetTypeRefEquals(from, to) ? { kind: "identity" } : { kind: "rejected", reason: "No selected native conversion." };
  } } }, types: { classifications: { resolveNode(node) { return node === array ? { kind: "array", element: destination } : optional; } } },
    scope: {}, names: { temporaryName: name => name } };
  const diagnostics = [];
  const consumed = [];
  const statements = () => planCsharpBorrowedSequenceConsumption(spread, fact, {}, input, diagnostics,
    () => ({ prelude: [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "evaluate_source" } }],
      completion: completion ?? { kind: "value", carrier: optional, expression: { kind: "IdentifierName", name: "source" } } }),
    selected => { consumed.push(selected); return [{ kind: "ExpressionStatement", expression: { kind: "IdentifierName", name: "consume_selected" } }]; },
    () => []);
  return { fact, statements, diagnostics, pairs, consumed, string, int32 };
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
  destination.fact.elementTarget = int32;
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
