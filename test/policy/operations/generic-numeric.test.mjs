import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourceHasNumericConstraint } from "../../../dist/policy/constraints/numeric-evidence.js";
import { selectCsharpGenericNumericOperation } from "../../../dist/policy/operations/numeric/generic.js";
import { csharpBinarySelectionsEqual } from "../../../dist/analysis/expected-types/binary-equality.js";

function scenario() {
  const file = {};
  const constraint = { kind: "number" };
  const declaration = { kind: "type-parameter", constraint };
  const binding = {};
  const expression = { kind: "value" };
  const type = {};
  const symbol = {};
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const scalar = { kind: "source-primitive", name: "float64" };
  const semantics = { types: { expressionType: () => type }, declarations: {
    declaredValueType: () => type, typeSymbol: () => symbol, primarySymbolDeclaration: () => declaration,
  } };
  const input = {
    ast: { getSourceFile: () => file, kindName: node => node.kind === "literal" ? "KindNumericLiteral" : node.kind,
      text: node => node.text, authoredRange: () => ({ kind: "synthetic" }),
      is: { IsTypeParameterDeclaration: node => node === declaration, IsUnionTypeNode: () => false,
        IsParenthesizedTypeNode: () => false, IsIntersectionTypeNode: () => false,
        IsParenthesizedExpression: () => false, IsPrefixUnaryExpression: () => false },
      as: { AsTypeParameterDeclaration: node => ({ Constraint: node.constraint }) } },
    navigation: { referenceFor: () => ({ declaration: binding }) },
    semantics: () => semantics,
    types: { resolveSelectedValue: () => carrier,
      resolveNode: node => node === constraint ? scalar : undefined },
  };
  return { input, file, declaration, expression, carrier, scalar };
}

test("native numeric evidence requires the exact declaration, carrier and emitted bound", () => {
  const { input, file, declaration, expression, carrier } = scenario();
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file, input), true);
  assert.equal(csharpSourceHasNumericConstraint(expression, { ...carrier, identity: "other" }, file, input), false);
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file,
    { ...input, types: { ...input.types, resolveSelectedValue: () => undefined } }), false);
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file,
    { ...input, ast: { ...input.ast, getSourceFile: () => undefined } }), false);
  declaration.constraint = undefined;
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file, input), false);
});

test("native generic comparisons admit same-carrier and zero operands in both directions", () => {
  const { input, expression, carrier, scalar } = scenario();
  const zero = { kind: "literal", text: "0" };
  for (const operator of ["<", "<=", ">", ">=", "===", "!=="]) {
    assert.equal(selectCsharpGenericNumericOperation(input, operator, expression, zero, carrier, scalar)?.zeroOperand, "right");
    assert.equal(selectCsharpGenericNumericOperation(input, operator, zero, expression, scalar, carrier)?.zeroOperand, "left");
    assert.equal(selectCsharpGenericNumericOperation(input, operator, expression, expression, carrier, carrier)?.kind, "generic-numeric");
  }
  for (const operand of [{ kind: "literal", text: "1" }, { kind: "value", text: "0" }]) {
    assert.equal(selectCsharpGenericNumericOperation(input, "<", expression, operand, carrier, scalar), undefined);
  }
  assert.equal(selectCsharpGenericNumericOperation(input, "+", expression, zero, carrier, scalar), undefined);
  assert.equal(selectCsharpGenericNumericOperation(input, "<", expression, expression,
    carrier, { ...carrier, identity: "other" }), undefined);
});

test("sealed generic operation equality retains zero position and native parameter identity", () => {
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const expression = {};
  const operation = { kind: "generic-numeric", operator: "<", carrier, zeroOperand: "right" };
  const selection = { kind: "resolved", sourceOperator: "<", left: expression, right: expression,
    targetOperation: operation, leftType: carrier, rightType: carrier,
    leftInputType: carrier, rightInputType: carrier, resultType: { kind: "source-primitive", name: "bool" } };
  assert.equal(csharpBinarySelectionsEqual(selection, { ...selection }), true);
  for (const changed of [{ ...operation, zeroOperand: "left" },
    { ...operation, carrier: { ...carrier, identity: "other" } }]) {
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection, targetOperation: changed }), false);
  }
});
