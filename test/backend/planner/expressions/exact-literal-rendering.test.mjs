import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpExactLiteralConversion } from "../../../../dist/backend/planner/expressions/literal-conversions.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpPlannedValue, sequenceCsharpPlannedValues } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { evaluatedConstant } from "../../../../dist/backend/planner/expressions/builders.js";
import { selectCsharpExactLiteralConversion } from "../../../../dist/policy/conversions/literals.js";
import { analyzeCsharpNativeConstants } from "../../../../dist/analysis/operations/native-constants.js";
import { analyzeCsharpLiteralAdmission } from "../../../../dist/analysis/operations/literals.js";
import { planCsharpPlannedDiscard } from "../../../../dist/backend/planner/statements/statement-output.js";


const primitive = name => csharpSourcePrimitiveTargetType(name);
const node = Object.freeze({});

function analyzeConstant(subject, carrier, selection, literal) {
  const input = {
    ast: { as: { AsParenthesizedExpression: () => undefined }, kindName: () => "NumericLiteral",
      is: { IsParenthesizedExpression: () => false, IsVoidExpression: () => false, IsNoSubstitutionTemplateLiteral: () => false } },
    demand: { entries: [{ use: { kind: "value", expression: subject, carrier } }] },
    literals: { literalValue: { get: () => literal } }, exact: { exactLiteral: { get: () => selection } },
    values: { valueRead: { get: () => ({ source: carrier, value: carrier }) } },
    types: { typeEmission: { get: () => undefined } }, references: { identifierEmission: { get: () => undefined } },
  };
  return analyzeCsharpNativeConstants(input).nativeConstant.get(subject, carrier);
}

for (const [name, minimum, maximum] of [
  ["int8", -128, 127], ["uint8", 0, 255], ["int16", -32768, 32767],
  ["uint16", 0, 65535], ["uint32", 0, 4294967295],
]) {
  for (const [boundary, value, expected] of [
    ["minimum-minus-one", minimum - 1, false], ["minimum", minimum, true],
    ["maximum", maximum, true], ["maximum-plus-one", maximum + 1, false],
  ]) {
    test(`native constant admission: ${name} ${boundary}`, () => {
      const target = primitive(name);
      const literal = { form: "numeric", number: value, integer: BigInt(value) };
      const selected = selectCsharpExactLiteralConversion(literal, target);
      assert.equal(selected.kind, expected ? "resolved" : "rejected", "native integer range is decided before rendering");
      const admitted = analyzeCsharpLiteralAdmission({
        ast: { is: { IsNumericLiteral: () => true, IsBigIntLiteral: () => false,
          IsTemplateExpression: () => false, IsNoSubstitutionTemplateLiteral: () => false } },
        demand: { entries: [{ use: { kind: "value", expression: node, carrier: target } }] },
        exact: { exactLiteral: { get: () => selected } }, literals: { literalValue: { get: () => literal } },
        values: { valueRead: { get: () => ({ source: target, value: target }) } },
      });
      assert.equal(admitted.issues.length, expected ? 0 : 1, "out-of-range values are rejected once at admission");
      assert.equal(admitted.records.literalEmission.get(node) !== undefined, expected, "invalid native literals are never emitted");
      if (!expected) {
        assert.equal(admitted.issues[0].sourceNode === node, true, "the diagnostic belongs to the exact source literal");
        assert.equal(admitted.issues[0].message, selected.reason);
      } else {
        assert.equal(analyzeConstant(node, target, selected, literal), true, "the sealed constant proof is produced once");
        const rendered = plan(selected, target).result;
        assert.equal(rendered.kind, "resolved");
        const effect = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [] };
        const combined = sequenceCsharpPlannedValues([
          csharpPlannedValue(target, rendered.expression, [], true),
          csharpPlannedValue(target, { kind: "LiteralExpression", value: 0 }, [{ kind: "ExpressionStatement", expression: effect }]),
        ], () => { throw new Error("An admitted native constant must not be captured."); },
        expressions => csharpPlannedValue(target, expressions[0]));
        assert.equal(combined.completion.expression === rendered.expression, true, "no redundant native copy or capture");
        assert.equal(combined.prelude.length, 1, "the following effect is kept exactly once");
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
  for (const selection of [{ kind: "not-applicable" }, { kind: "source-representation" }]) {
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
    [{ kind: "float", target: half, precision: "float16", bits: 0x8000, token: { significand: "0" }, negative: true },
      { kind: "CastExpression", type: { kind: "IdentifierName", name: "Half", requiredUsingNamespace: "System" },
        expression: { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" },
          operand: { kind: "NumericLiteralExpression", token: { significand: "0" }, suffix: "D" } } }],
    [{ kind: "integer", target: primitive("int32"), width: "int32", value: 0n }, { kind: "LiteralExpression", value: 0 }],
    [{ kind: "integer", target: primitive("int32"), width: "int32", value: -2147483648n },
      { kind: "LiteralExpression", value: -2147483648 }],
    [{ kind: "integer", target: primitive("int8"), width: "int8", value: -128n },
      { kind: "CastExpression", type: { kind: "PredefinedType", name: "sbyte" }, expression: { kind: "LiteralExpression", value: -128 } }],
    [{ kind: "integer", target: primitive("uint32"), width: "uint32", value: 4294967295n },
      { kind: "CastExpression", type: { kind: "PredefinedType", name: "uint" }, expression: { kind: "LiteralExpression", value: 4294967295 } }],
    [{ kind: "char", value: "a" }, { kind: "CharacterLiteralExpression", value: "a" }],
    [{ kind: "float", target: half, precision: "float16", bits: 0x3e00, token: { significand: "1.5" }, negative: false },
      { kind: "CastExpression", type: { kind: "IdentifierName", name: "Half", requiredUsingNamespace: "System" },
        expression: { kind: "NumericLiteralExpression", token: { significand: "1.5" }, suffix: "D" } }],
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

test("rejected literals cannot reach the renderer after admission", () => {
  assert.throws(() => plan({ kind: "rejected", reason: "range" }), error =>
    error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
    error.message === "A rejected exact literal cannot reach native planning.");
});

test("sealed native constant proofs distinguish scalar recipes from source values and effects", () => {
  for (const precision of ["float32", "decimal"]) {
    const target = primitive(precision);
    const selected = { kind: "resolved", recipe: { kind: "float", target, precision,
      token: { significand: "1.5" }, negative: true } };
    assert.equal(analyzeConstant(node, target, selected), true, precision + ": signed scalar constant");
    const expression = plan(selected, target).result.expression;
    assert.equal(expression.operatorToken.kind, "MinusToken");
    const prelude = [];
    const result = evaluatedConstant(expression, target, "number", prelude, "omit");
    assert.equal(result.kind === "LiteralExpression" && result.value === "number", true,
      precision + ": a native constant result is not a switch-as-let");
    assert.equal(prelude.length, 0, precision + ": the owned native scalar constant needs no discarded evaluation");
    for (const kind of ["identifier", "call", "update", "user-conversion"]) {
      assert.equal(analyzeConstant({ kind }, target, { kind: "not-applicable" }), false,
        precision + ": " + kind + " remains observable without source constant evidence");
    }
  }
  for (const name of ["int8", "uint8", "int16", "uint16", "uint32"]) {
    const target = primitive(name);
    assert.equal(analyzeConstant(node, target, selectCsharpExactLiteralConversion(
      { form: "numeric", integer: 0n, number: 0 }, target)), true, name + ": builtin integer recipe");
    for (const literal of [{ form: "numeric", number: 0.5 }, { form: "numeric", number: Infinity }, undefined]) {
      assert.equal(analyzeConstant(node, target, selectCsharpExactLiteralConversion(literal, target), literal), false,
        name + ": unproven or non-integer values are not scalar constants");
    }
  }
  const effect = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "effect" }, arguments: [] };
  const statements = planCsharpPlannedDiscard(csharpPlannedValue(primitive("float32"), effect));
  assert.equal(statements.length, 1);
  assert.equal(statements[0].expression === effect, true, "discard never erases an observable call");
  const effects = [];
  const observed = evaluatedConstant(effect, primitive("float32"), "number", effects, "evaluate");
  assert.equal(observed.kind === "LiteralExpression" && observed.value === "number", true,
    "the same native constant result preserves its observable source evaluation");
  assert.equal(effects.length === 1 && effects[0].kind === "ExpressionStatement" && effects[0].expression === effect, true,
    "the identical actual call is evaluated once in its owned prelude");
  for (const pure of [
    { kind: "IdentifierName", name: "local" },
    { kind: "IdentifierName", name: "parameter" },
    { kind: "LiteralExpression", value: 7 },
    { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: "readonlyValue" },
  ]) {
    const prelude = [];
    const selected = evaluatedConstant(pure, primitive("float32"), "number", prelude, "omit");
    assert.equal(selected.kind === "LiteralExpression" && selected.value === "number" && prelude.length === 0, true,
      "a fixture-owned pure evaluation proof emits the literal alone without inspecting operand syntax");
  }
  for (const missing of [undefined, "unknown"]) {
    assert.throws(() => evaluatedConstant(effect, primitive("float32"), "number", [], missing),
      error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT", "an omitted or invalid effect authority cannot default");
  }
});
