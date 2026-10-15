import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpExactLiteralConversion } from "../../../../dist/backend/planner/expressions/literal-conversions.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const node = Object.freeze({});

function plan(selection, target = primitive("int64")) {
  const reads = [];
  const input = {
    program: { records: { exactLiteral: Object.freeze({ get: (expression, requested) => {
      reads.push([expression, requested]);
      return selection;
    } }) } },
    scope: { typeParameterNames: undefined },
  };
  return { result: planCsharpExactLiteralConversion(input, node, target), reads };
}

test("the literal planner fails its invariant when the selected record is missing and never substitutes the source literal", () => {
  const target = primitive("int32");
  assert.throws(() => plan(undefined, target), error =>
    error.message === "C# literal planning requires the sealed exact-literal selection of its requested target." &&
    error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT");
  assert.throws(() => plan(undefined, undefined), /requires the sealed exact-literal selection/u,
    "the intrinsic request is a required record too");
});

test("the literal planner reads one record at the requested key and passes unrendered outcomes through", () => {
  const target = primitive("uint8");
  for (const selection of [{ kind: "not-applicable" }, { kind: "source-representation" }, { kind: "rejected", reason: "kept" }]) {
    const { result, reads } = plan(Object.freeze(selection), target);
    assert.deepEqual(result, selection, selection.kind);
    assert.deepEqual(reads, [[node, target]], "one read at the exact node and target");
  }
});

test("the literal planner renders each selected recipe without deciding it", () => {
  const half = primitive("float16");
  const cases = [
    [{ kind: "signed-zero", target: primitive("float64"), precision: "float64" },
      { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" }, operand: { kind: "NumericLiteralExpression", value: 0, suffix: "D" } }],
    [{ kind: "signed-zero", target: half, precision: "float16" },
      { kind: "CastExpression", type: { kind: "IdentifierName", name: "Half", requiredUsingNamespace: "System" },
        expression: { kind: "ParenthesizedExpression", expression: { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" },
          operand: { kind: "NumericLiteralExpression", value: 0, suffix: "F" } } } }],
    [{ kind: "zero" }, { kind: "LiteralExpression", value: 0 }],
    [{ kind: "char", value: "a" }, { kind: "CharacterLiteralExpression", value: "a" }],
    [{ kind: "float", target: half, precision: "float16", value: 1.5 },
      { kind: "CastExpression", type: { kind: "IdentifierName", name: "Half", requiredUsingNamespace: "System" },
        expression: { kind: "LiteralExpression", value: 1.5 } }],
    [{ kind: "float", target: primitive("decimal"), precision: "decimal", value: 0.1 },
      { kind: "NumericLiteralExpression", value: 0.1, suffix: "M" }],
    [{ kind: "integer", target: primitive("int64"), width: "int64", value: -(1n << 63n) },
      { kind: "SimpleMemberAccessExpression", receiver: { kind: "PredefinedType", name: "long" }, name: "MinValue" }],
    [{ kind: "integer", target: primitive("int128"), width: "int128", value: -1n },
      { kind: "ObjectCreationExpression", type: { kind: "IdentifierName", name: "Int128", requiredUsingNamespace: "System" },
        arguments: [{ kind: "Argument", expression: { kind: "IntegerLiteralExpression", digits: "18446744073709551615", suffix: "UL" } },
          { kind: "Argument", expression: { kind: "IntegerLiteralExpression", digits: "18446744073709551615", suffix: "UL" } }] }],
    [{ kind: "integer", target: primitive("native-int"), width: "native-int", value: -1n },
      { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: { kind: "PredefinedType", name: "nint" },
        name: "CreateChecked" }, arguments: [{ kind: "Argument", expression: { kind: "PrefixUnaryExpression",
        operatorToken: { kind: "MinusToken" }, operand: { kind: "IntegerLiteralExpression", digits: "1", suffix: "L" } } }] }],
  ];
  for (const [recipe, expression] of cases) {
    const { result } = plan(Object.freeze({ kind: "resolved", recipe: Object.freeze(recipe) }));
    assert.deepEqual(result, { kind: "resolved", expression }, recipe.kind);
  }
});
