import assert from "node:assert/strict";
import test from "node:test";
import { resolveBinaryTargetRepresentation } from "../../../dist/policy/types/resolution/representation.js";
import { selectCsharpBinaryOperands } from "../../../dist/policy/operations/operators/operator-selection.js";
import { csharpBinarySelectionsEqual } from "../../../dist/analysis/expected-types/binary-equality.js";
import { selectCsharpConversion, selectCsharpExpressionConversion } from "../../../dist/policy/conversions/index.js";
import { csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpTargetNamedType, csharpVoidTargetType,
  csharpTsValueTargetType,
  combineCsharpTargetUnionMembers, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const boolean = csharpSourcePrimitiveTargetType("bool");
const integer = csharpSourcePrimitiveTargetType("uint64");
const value = { kind: "value" };
const rightValue = { kind: "value" };
const trueLiteral = { kind: "KindTrueKeyword" };
const falseLiteral = { kind: "KindFalseKeyword" };
const ast = {
  kindName: node => node.kind,
  operatorKindName: node => node.operator,
  is: Object.fromEntries(["BinaryExpression", "ArrayLiteralExpression", "ObjectLiteralExpression", "NumericLiteral", "BigIntLiteral",
    "PrefixUnaryExpression", "StringLiteral", "NoSubstitutionTemplateLiteral", "ParenthesizedExpression",
    "AsExpression", "TypeAssertion", "SatisfiesExpression", "NonNullExpression"]
    .map(name => [`Is${name}`, node => node.kind === name])),
  as: { ...Object.fromEntries(["ParenthesizedExpression", "AsExpression", "TypeAssertion", "SatisfiesExpression", "NonNullExpression"]
    .map(name => [`As${name}`, node => ({ Expression: node.expression })])),
    AsBinaryExpression: node => ({ Left: node.left, Right: node.right }) },
};
const input = { ast, target: {}, types: { resolveReadStorage: () => undefined },
  projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined } };

test("conditional values preserve finite native arms, exact width and one absence", () => {
  const expected = csharpNullableTargetType(csharpRuntimeUnionTargetType([boolean, integer]));
  const combined = combineCsharpTargetUnionMembers([boolean, csharpNullableTargetType(integer), csharpAbsenceTargetType()]);
  assert.ok(targetTypeRefEquals(combined, expected));
  assert.equal(getCsharpRuntimeUnionArms(combined), undefined);
  assert.deepEqual(getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(combined)), [boolean, integer]);
  for (const operator of ["&&", "||"]) {
    const carrier = resolveBinaryTargetRepresentation(ast, operator, value, boolean, value, csharpNullableTargetType(integer));
    assert.ok(targetTypeRefEquals(carrier, expected));
    const selected = selectCsharpBinaryOperands(input, value, rightValue, operator, carrier,
      node => node === value ? boolean : csharpNullableTargetType(integer));
    assert.equal(selected.kind, "resolved");
    assert.deepEqual(selected.targetOperation, { kind: "conditional-value", operator, branch: "conditional" });
    assert.ok(targetTypeRefEquals(selected.resultType, expected));
  }
});

test("constant boolean conditions select only their reachable native payload", () => {
  for (const [operator, left, branch] of [["&&", trueLiteral, "right"], ["&&", falseLiteral, "left"],
    ["||", trueLiteral, "left"], ["||", falseLiteral, "right"]]) {
    const expected = branch === "right" ? integer : boolean;
    const wrapped = { kind: "ParenthesizedExpression", expression: left };
    const carrier = resolveBinaryTargetRepresentation(ast, operator, wrapped, boolean, value, integer);
    assert.ok(targetTypeRefEquals(carrier, expected));
    const selection = selectCsharpBinaryOperands(input, wrapped, value, operator, carrier,
      node => node === value ? integer : boolean);
    assert.equal(selection.kind, "resolved");
    assert.equal(selection.targetOperation.branch, branch);
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection,
      targetOperation: { ...selection.targetOperation, branch: "conditional" } }), false);
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection, resultType: csharpSourcePrimitiveTargetType("float64") }), false);
  }
});

test("conditional value admission never invents truthiness, numeric conversion or object boxing", () => {
  const record = csharpTargetNamedType("fixture.Record");
  const expected = combineCsharpTargetUnionMembers([boolean, record]);
  const selected = selectCsharpBinaryOperands(input, trueLiteral, value, "&&", record,
    node => node === trueLiteral ? boolean : record);
  assert.equal(selected.kind, "resolved");
  assert.ok(targetTypeRefEquals(selected.rightType, record));
  assert.ok(targetTypeRefEquals(resolveBinaryTargetRepresentation(ast, "&&", value, boolean, value, record), expected));
  const invalidLeft = selectCsharpBinaryOperands(input, trueLiteral, value, "&&", expected,
    node => node === trueLiteral ? integer : record);
  assert.equal(invalidLeft.kind, "rejected");
  const invalidResult = selectCsharpBinaryOperands(input, value, rightValue, "||", integer,
    node => node === value ? boolean : integer);
  assert.equal(invalidResult.kind, "rejected");
  const invalidRight = selectCsharpBinaryOperands(input, value, rightValue, "&&", boolean,
    node => node === value ? boolean : record);
  assert.equal(invalidRight.kind, "rejected");
});

test("comma condition completion selects its exact literal branch without dropping preceding effects", () => {
  const sequence = { kind: "BinaryExpression", operator: "KindCommaToken", left: value, right: trueLiteral };
  assert.ok(targetTypeRefEquals(resolveBinaryTargetRepresentation(ast, "&&", sequence, boolean, rightValue, integer), integer));
});

test("a completed void expression may supply absence but void is not a native value conversion", () => {
  const unit = csharpVoidTargetType();
  const optional = csharpNullableTargetType(integer);
  assert.equal(selectCsharpConversion(input, unit, optional, "implicit").kind, "rejected");
  assert.equal(selectCsharpExpressionConversion(input, value, unit, optional, "implicit").kind, "absence");
  assert.equal(selectCsharpExpressionConversion(input, value, unit, integer, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(input, unit, csharpTsValueTargetType(), "implicit").kind, "rejected");
  assert.equal(selectCsharpExpressionConversion(input, value, unit, csharpTsValueTargetType(), "implicit").kind, "absence");
});
