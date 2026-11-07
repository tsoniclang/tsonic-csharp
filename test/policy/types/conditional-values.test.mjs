import assert from "node:assert/strict";
import test from "node:test";
import { createPublishedSourceUnionFixture } from "../../helpers/published-source-unions.mjs";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { selectCsharpBinaryOperands } from "../../../dist/analysis/operations/operators.js";
import { csharpBinarySelectionsEqual } from "../../helpers/binary-selections.mjs";
import { selectCsharpConversion, selectCsharpExpressionConversion } from "../../../dist/policy/conversions/index.js";
import { csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, csharpVoidTargetType,
  csharpTsValueTargetType,
  getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const boolean = csharpSourcePrimitiveTargetType("bool");
const integer = csharpSourcePrimitiveTargetType("uint64");
const record = csharpTargetNamedType("fixture.Record", undefined, undefined, { allowsRefLikeTypeArguments: [] });
const fixture = createPublishedSourceUnionFixture(`
  import type { uint64 } from "@tsonic/core/types.js";
  declare class Record { readonly value: string; }
  declare function conditional(present: boolean | uint64, optional: boolean | uint64 | undefined,
    repeated: boolean | (uint64 | undefined) | undefined, object: boolean | Record): void;
`, { Record: () => record });
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
  forEachChild: (node, visit) => [...(node.children ?? []), ...(node.expression === undefined ? [] : [node.expression]),
    ...(node.left === undefined ? [] : [node.left]), ...(node.right === undefined ? [] : [node.right])].forEach(visit),
  authoredRange: () => ({ kind: "synthetic" }),
  text: node => node.text,
};
const literalValues = { literalValue: { get: node =>
  analyzeSourceLiteralValues(ast, [{ kind: "SourceFile", children: [node] }]).literalValue.get(node) } };
const input = { ast, literalValues, target: {}, types: { resolveReadStorage: () => undefined },
  projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };

test("sequence completion demand is sealed independently of its checked value carrier", () => {
  const selections = ["consumed", "discarded"].map(resultUse => selectCsharpBinaryOperands({
    ...input, navigation: { expressionResultUse: node => {
      assert.equal(node === rightValue, true, "exact selected right operand");
      return resultUse;
    } },
  }, value, rightValue, ",", integer, () => integer));
  for (const [index, selected] of selections.entries()) {
    assert.equal(selected.kind, "resolved");
    assert.deepEqual(selected.targetOperation, { kind: "sequence", resultUse: index === 0 ? "consumed" : "discarded" });
    assert.equal(targetTypeRefEquals(selected.resultType, integer), true, "source value checking is retained");
    assert.equal(csharpBinarySelectionsEqual(selected, selected), true);
  }
  assert.equal(csharpBinarySelectionsEqual(selections[0], selections[1]), false, "changed demand cannot reuse sealed selection");
});

test("conditional values preserve finite native arms, exact width and one absence", () => {
  const expected = fixture.carrier("conditional", 1);
  const combined = fixture.carrier("conditional", 2);
  assert.ok(targetTypeRefEquals(combined, expected));
  assert.equal(getCsharpRuntimeUnionArms(combined), undefined);
  assert.deepEqual(getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(combined)), [boolean, integer]);
  for (const operator of ["&&", "||"]) {
    const selected = selectCsharpBinaryOperands(input, value, rightValue, operator, expected,
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
    const selection = selectCsharpBinaryOperands(input, wrapped, value, operator, expected,
      node => node === value ? integer : boolean);
    assert.equal(selection.kind, "resolved");
    assert.ok(targetTypeRefEquals(selection.resultType, expected));
    assert.equal(selection.targetOperation.branch, branch);
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection,
      targetOperation: { ...selection.targetOperation, branch: "conditional" } }), false);
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection, resultType: csharpSourcePrimitiveTargetType("float64") }), false);
  }
});

test("conditional value admission never invents truthiness, numeric conversion or object boxing", () => {
  const expected = fixture.carrier("conditional", 3);
  const selected = selectCsharpBinaryOperands(input, trueLiteral, value, "&&", record,
    node => node === trueLiteral ? boolean : record);
  assert.equal(selected.kind, "resolved");
  assert.ok(targetTypeRefEquals(selected.rightType, record));
  const conditional = selectCsharpBinaryOperands(input, value, rightValue, "&&", expected,
    node => node === value ? boolean : record);
  assert.equal(conditional.kind, "resolved");
  assert.ok(targetTypeRefEquals(conditional.resultType, expected));
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
  const context = { ...input,
    effectiveTypes: { get: node => {
      assert.equal(node === sequence, true, "the synthetic comma has no Source publication");
      return undefined;
    } },
    navigation: { expressionResultUse: node => {
      assert.equal(node === trueLiteral, true, "the same comma final operand is consumed");
      return "consumed";
    } },
  };
  const selected = selectCsharpBinaryOperands(context, sequence, rightValue, "&&", integer,
    node => node === sequence ? boolean : integer);
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.targetOperation.branch, "right");
  assert.ok(targetTypeRefEquals(selected.resultType, integer));
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

test("nested coalescing preserves the selected native nullable width and generic storage", () => {
  const optional = csharpNullableTargetType(integer);
  for (const right of [optional, csharpAbsenceTargetType()]) {
    const selected = selectCsharpBinaryOperands(input, value, rightValue, "??", optional,
      node => node === value ? optional : right);
    assert.equal(selected.kind, "resolved");
    assert.equal(targetTypeRefEquals(selected.resultType, optional), true);
  }
  const narrowed = selectCsharpBinaryOperands(input, value, rightValue, "??", integer,
    node => node === value ? optional : integer);
  assert.equal(narrowed.kind, "resolved");
  assert.equal(targetTypeRefEquals(narrowed.resultType, integer), true);
  const generic = { kind: "type-parameter", identity: "fixture::T", name: "T" };
  const genericOptional = csharpNullableTargetType(generic);
  const genericSelection = selectCsharpBinaryOperands(input, value, rightValue, "??", generic,
    node => node === value ? genericOptional : generic);
  assert.equal(genericSelection.kind, "resolved");
  assert.equal(targetTypeRefEquals(genericSelection.resultType, generic), true);
  const invalid = selectCsharpBinaryOperands(input, value, rightValue, "??", integer,
    node => node === value ? optional : csharpStringTargetType());
  assert.equal(invalid.kind, "rejected");
});
