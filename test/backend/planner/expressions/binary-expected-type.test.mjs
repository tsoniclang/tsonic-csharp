import assert from "node:assert/strict";
import test from "node:test";
import { tryPlanBinaryExpressionWithExpectedType } from "../../../../dist/backend/planner/expressions/operators/binary-expected-type.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const binary = { case: "binary" };
const other = { case: "other" };
const left = { case: "left" };
const right = { case: "right" };
const missingSelectionMessage =
  "C# binary planning requires a sealed expected-target operation classification that analysis did not produce.";

function selection(resultType, inputType = int32) {
  return { kind: "resolved", sourceOperator: "+", targetOperation: { kind: "operator", operator: "+" },
    left, right, leftType: inputType, rightType: inputType, leftInputType: inputType, rightInputType: inputType, resultType };
}

function context({ baseline, eligible, contextual }) {
  const reads = [];
  const input = { scope: {}, program: {
    source: { ast: { is: { IsBinaryExpression: node => node === binary }, kindName: () => "KindIdentifier" } },
    records: {
      binaryOperation: { get: node => node === binary && baseline !== undefined ? { target: baseline } : undefined },
      operatorForm: { get: () => "selected", usesExpectedResultType: node => node === binary ? eligible : undefined },
      expectedBinary: { get: (node, target) => {
        reads.push({ node, target });
        if (contextual === "untouched") assert.fail("the contextual selection must not be read");
        return contextual;
      } },
      int32Remainder: { get: () => false },
    },
  } };
  return { input, reads };
}

const refuseExpression = () => assert.fail("no operand is planned without an expected selection");
const refuseExpected = () => assert.fail("no expected operand is planned without an admitted selection");

function plan(input, node, target, diagnostics, planExpression = refuseExpression, planExpected = refuseExpected) {
  return tryPlanBinaryExpressionWithExpectedType(node, {}, input, diagnostics, target, planExpression, planExpected, undefined);
}

test("a non-binary node or an absent expected target is not contextual binary planning", () => {
  for (const [label, node, target] of [["non-binary node", other, int32], ["absent expected target", binary, undefined]]) {
    const { input, reads } = context({ baseline: selection(int32), eligible: true, contextual: "untouched" });
    const diagnostics = [];
    assert.equal(plan(input, node, target, diagnostics) === undefined, true, `${label}: no contextual plan`);
    assert.equal(reads.length === 0 && diagnostics.length === 0, true, `${label}: no lookup and no diagnostics`);
  }
});

test("a resolved baseline without stored eligibility never reads the contextual selection", () => {
  for (const eligible of [false, undefined]) {
    const { input, reads } = context({ baseline: selection(int32), eligible, contextual: "untouched" });
    const diagnostics = [];
    assert.equal(plan(input, binary, int32, diagnostics) === undefined, true, `eligibility ${eligible}: baseline path`);
    assert.equal(reads.length === 0 && diagnostics.length === 0, true, `eligibility ${eligible}: untouched and silent`);
  }
});

test("an absent or rejected baseline keeps the exact missing contextual selection diagnostic", () => {
  for (const [label, baseline] of [["absent baseline", undefined], ["rejected baseline", { kind: "rejected", reason: "baseline refused" }]]) {
    for (const eligible of [false, true]) {
      const { input, reads } = context({ baseline, eligible, contextual: undefined });
      const diagnostics = [];
      assert.equal(plan(input, binary, int32, diagnostics) === undefined, true, `${label}, eligibility ${eligible}: no plan`);
      assert.equal(reads.length === 1 && reads[0].node === binary && reads[0].target === int32, true,
        `${label}, eligibility ${eligible}: one exact contextual lookup`);
      assert.equal(diagnostics.length === 1 && diagnostics[0].message === missingSelectionMessage && diagnostics[0].sourceNode === binary, true,
        `${label}, eligibility ${eligible}: the one exact missing-selection diagnostic`);
    }
  }
});

test("a resolved contextual selection with stored false eligibility is not planned", () => {
  const { input, reads } = context({ baseline: undefined, eligible: false, contextual: selection(int32) });
  const diagnostics = [];
  assert.equal(plan(input, binary, int32, diagnostics) === undefined, true, "ineligible contextual selection returns to the baseline path");
  assert.equal(reads.length === 1 && diagnostics.length === 0, true, "one lookup and no diagnostics");
});

test("an eligible contextual selection whose result differs from the target is not planned", () => {
  const { input, reads } = context({ baseline: undefined, eligible: true, contextual: selection(float64) });
  const diagnostics = [];
  assert.equal(plan(input, binary, int32, diagnostics) === undefined, true, "a different contextual result returns to the baseline path");
  assert.equal(reads.length === 1 && diagnostics.length === 0, true, "one lookup and no diagnostics");
});

test("an eligible contextual selection equal to the target plans its native operands in order with the selected carriers", () => {
  const selected = selection(int32);
  const { input, reads } = context({ baseline: { ...selected, resultType: float64 }, eligible: true, contextual: selected });
  const diagnostics = [];
  const operands = [];
  const planned = plan(input, binary, int32, diagnostics, refuseExpression, (operand, _file, _input, _diagnostics, expectedType, _subject, expectedTargetType) => {
    operands.push({ operand, expectedType, expectedTargetType });
    return csharpPlannedValue(expectedTargetType, { kind: "IdentifierName", name: operand === left ? "first" : "second" });
  });
  assert.equal(reads.length === 1 && diagnostics.length === 0, true, "one lookup and no diagnostics");
  assert.equal(operands.length === 2 && operands[0].operand === left && operands[1].operand === right, true,
    "the left operand is planned before the right operand");
  assert.equal(operands[0].expectedTargetType === selected.leftInputType && operands[1].expectedTargetType === selected.rightInputType, true,
    "each operand is planned against its exact selected input carrier");
  assert.equal(operands.every(entry => entry.expectedType !== undefined), true, "each operand receives its native type");
  assert.equal(planned !== undefined && planned.completion.kind === "value" && planned.completion.carrier === int32, true,
    "the planned value completes at the exact target carrier");
  assert.equal(planned.prelude.length === 0, true, "the native operation needs no prelude");
  assert.equal(printCsharpExpression(planned.completion.expression), "first + second", "the selected native operator is emitted");
});
