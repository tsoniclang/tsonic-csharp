import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpExactLiteralConversion } from "../../../../dist/backend/planner/expressions/literal-conversions.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpPlannedExpressionIsStable, csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { evaluatedConstant } from "../../../../dist/backend/planner/expressions/csharp-expression-builders.js";
import { csharpExpressionIsNativeNumericConstant } from "../../../../dist/backend/target-ast/syntax/expressions.js";
import { planCsharpPlannedDiscard } from "../../../../dist/backend/planner/statements/statement-output.js";
import { printCsharpStatement } from "../../../../dist/print/source/printer.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const node = Object.freeze({});

for (const [name, primitiveName, minimum, maximum] of [
  ["sbyte", "int8", -128, 127],
  ["byte", "uint8", 0, 255],
  ["short", "int16", -32768, 32767],
  ["ushort", "uint16", 0, 65535],
  ["uint", "uint32", 0, 4294967295],
]) {
  for (const [boundary, value, expected] of [
    ["minimum-minus-one", minimum - 1, false],
    ["minimum", minimum, true],
    ["maximum", maximum, true],
    ["maximum-plus-one", maximum + 1, false],
  ]) {
    test(`native constant proof: ${name} ${boundary}`, () => {
      const label = `${name} ${boundary}`;
      const expression = { kind: "CastExpression", type: { kind: "PredefinedType", name },
        expression: { kind: "LiteralExpression", value } };
      assert.equal(csharpExpressionIsNativeNumericConstant(expression), expected,
        `${label}: only an in-range builtin cast proves a constant`);
      assert.equal(csharpPlannedExpressionIsStable(expression), expected,
        `${label}: stability requires the same native range proof`);
      const evaluated = evaluatedConstant(expression, "number");
      const statements = planCsharpPlannedDiscard(csharpPlannedValue(primitive(primitiveName), expression));
      if (expected) {
        assert.deepEqual(evaluated, { kind: "LiteralExpression", value: "number" },
          `${label}: a valid constant can be replaced without evaluation`);
        assert.equal(statements.length, 0, `${label}: a valid discarded constant adds no native work`);
      } else {
        assert.equal(evaluated.kind, "SwitchExpression", `${label}: evaluation cannot disappear`);
        assert.equal(evaluated.expression === expression, true, `${label}: the exact invalid cast is retained`);
        assert.equal(statements.length, 1, `${label}: a discarded invalid cast is not erased`);
        assert.equal(statements[0].expression.right === expression, true,
          `${label}: the discarded statement retains the exact cast`);
        assert.equal(printCsharpStatement(statements[0]), `_ = (${name})${value};`,
          `${label}: native syntax remains available for the native range diagnostic`);
      }
    });
  }
}

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
        expression: { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" },
          operand: { kind: "NumericLiteralExpression", token: { significand: "0" }, suffix: "F" } } }],
    [{ kind: "integer", target: primitive("int32"), width: "int32", value: 0n }, { kind: "LiteralExpression", value: 0 }],
    [{ kind: "integer", target: primitive("int32"), width: "int32", value: -2147483648n },
      { kind: "LiteralExpression", value: -2147483648 }],
    [{ kind: "integer", target: primitive("int8"), width: "int8", value: -128n },
      { kind: "CastExpression", type: { kind: "PredefinedType", name: "sbyte" }, expression: { kind: "LiteralExpression", value: -128 } }],
    [{ kind: "integer", target: primitive("uint32"), width: "uint32", value: 4294967295n },
      { kind: "CastExpression", type: { kind: "PredefinedType", name: "uint" }, expression: { kind: "LiteralExpression", value: 4294967295 } }],
    [{ kind: "char", value: "a" }, { kind: "CharacterLiteralExpression", value: "a" }],
    [{ kind: "float", target: half, precision: "float16", value: 1.5 },
      { kind: "CastExpression", type: { kind: "IdentifierName", name: "Half", requiredUsingNamespace: "System" },
        expression: { kind: "LiteralExpression", value: 1.5 } }],
    [{ kind: "float", target: primitive("decimal"), precision: "decimal", token: { significand: "0.1" }, negative: false },
      { kind: "NumericLiteralExpression", token: { significand: "0.1" }, suffix: "M" }],
    [{ kind: "float", target: primitive("float32"), precision: "float32", token: { significand: "1.00000005960464477539062500000001" }, negative: true },
      { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" },
        operand: { kind: "NumericLiteralExpression", token: { significand: "1.00000005960464477539062500000001" }, suffix: "F" } }],
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

test("signed native numeric token syntax stays a stable scalar without admitting effectful or overloaded prefixes", () => {
  for (const precision of ["float32", "decimal"]) {
    const { result } = plan({ kind: "resolved", recipe: { kind: "float", target: primitive(precision), precision,
      token: { significand: "1.5" }, negative: true } });
    const expression = result.expression;
    const old = { kind: "NumericLiteralExpression", value: -1.5, suffix: precision === "float32" ? "F" : "M" };
    assert.equal(csharpPlannedExpressionIsStable(expression), csharpPlannedExpressionIsStable(old), `${precision}: stability unchanged`);
    assert.deepEqual(evaluatedConstant(expression, "number"), { kind: "LiteralExpression", value: "number" },
      `${precision}: replacing an already classified constant does not add a switch`);
    const positive = { ...expression, operatorToken: { kind: "PlusToken" } };
    assert.equal(csharpPlannedExpressionIsStable(positive), true, `${precision}: builtin positive sign`);
    for (const operand of [{ kind: "IdentifierName", name: "overloaded" },
      { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "effect" }, arguments: [] }]) {
      const unsafe = { ...expression, operand };
      assert.equal(csharpPlannedExpressionIsStable(unsafe), false, `${precision}: no value or callable inference`);
      assert.equal(evaluatedConstant(unsafe, "number").kind, "SwitchExpression", `${precision}: evaluation remains observable`);
    }
    const update = { ...expression, operatorToken: { kind: "MinusMinusToken" } };
    assert.equal(csharpPlannedExpressionIsStable(update), false, `${precision}: an update never becomes a scalar literal`);
  }
});

test("native small integer constant casts retain scalar stability and elision without admitting user conversions", () => {
  for (const [name, value] of [["int8", -128n], ["uint8", 255n], ["int16", -32768n], ["uint16", 65535n], ["uint32", 4294967295n]]) {
    const { result } = plan({ kind: "resolved", recipe: { kind: "integer", target: primitive(name), width: name, value } });
    const expression = result.expression;
    assert.equal(expression.kind, "CastExpression", `${name}: the selected native carrier is explicit`);
    assert.equal(csharpPlannedExpressionIsStable(expression), true, `${name}: a primitive constant cast requires no capture`);
    assert.deepEqual(evaluatedConstant(expression, "number"), { kind: "LiteralExpression", value: "number" },
      `${name}: replacing a native constant requires no switch`);
    const excluded = [
      { ...expression, type: { kind: "IdentifierName", name: expression.type.name } },
      { ...expression, type: { kind: "PredefinedType", name: "float" } },
      { ...expression, expression: { kind: "IdentifierName", name: "value" } },
      { ...expression, expression: { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "effect" }, arguments: [] } },
      { ...expression, expression: { kind: "LiteralExpression", value: 0.5 } },
      { ...expression, expression: { kind: "LiteralExpression", value: Number.POSITIVE_INFINITY } },
    ];
    for (const [index, invalid] of excluded.entries()) {
      assert.equal(csharpPlannedExpressionIsStable(invalid), false, `${name}: excluded grammar ${index}`);
      assert.equal(evaluatedConstant(invalid, "number").kind, "SwitchExpression", `${name}: excluded operand ${index} is not elided`);
    }
  }
});
