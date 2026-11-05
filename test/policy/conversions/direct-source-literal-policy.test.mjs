import assert from "node:assert/strict";
import { test } from "node:test";
import { csharpSourcePrimitiveTargetType, isCsharpArrayIndexTargetType, isCsharpIntegralTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { acceptedEffectiveSource, assertNativeEffectiveRefusal, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";
import { selectCsharpScalarLiteralCarrier } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpStringTargetType, csharpBigIntegerTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";

test("scalar admission chooses one physical payload for direct nullable union and nullable-union storage", () => {
  const cases = [
    ["minimum signed integer", "-2147483648", csharpSourcePrimitiveTargetType("int32")],
    ["half", "1.5", csharpSourcePrimitiveTargetType("float16")],
    ["single", "1.5", csharpSourcePrimitiveTargetType("float32")],
    ["double", "1.5", csharpSourcePrimitiveTargetType("float64")],
    ["decimal", "1.5", csharpSourcePrimitiveTargetType("decimal")],
    ["negative zero", "-0", csharpSourcePrimitiveTargetType("float64")],
    ["character", '"x"', csharpSourcePrimitiveTargetType("char")],
    ["string", '"text"', csharpStringTargetType()],
    ["boolean", "true", csharpSourcePrimitiveTargetType("bool")],
    ["bigint", "1n", csharpBigIntegerTargetType()],
  ];
  const literals = checkedSourceLiteralValues(cases.map(([, spelling]) => spelling));
  for (const [index, [name, , payload]] of cases.entries()) {
    const other = name === "boolean" ? csharpStringTargetType() : csharpSourcePrimitiveTargetType("bool");
    const union = csharpRuntimeUnionTargetType([payload, other]);
    for (const [form, storage] of [["direct", payload], ["nullable", csharpNullableTargetType(payload)],
      ["union", union], ["nullable union", csharpNullableTargetType(union)]]) {
      assert.equal(targetTypeRefEquals(selectCsharpScalarLiteralCarrier(literals[index], storage), payload), true,
        `${name}/${form}: the physical payload is the same admitted native scalar`);
      assert.equal(selectCsharpScalarLiteralCarrier(undefined, storage) === undefined, true, `${name}/${form}: no literal`);
    }
  }
  const [aggregate, overflow] = checkedSourceLiteralValues(["[1]", "2147483648"]);
  const integer = csharpSourcePrimitiveTargetType("int32");
  assert.equal(selectCsharpScalarLiteralCarrier(aggregate, integer) === undefined, true, "aggregates have a separate admission owner");
  assert.equal(selectCsharpScalarLiteralCarrier(literals[0], undefined) === undefined, true, "no storage contract");
  for (const storage of [integer, csharpNullableTargetType(integer),
    csharpRuntimeUnionTargetType([integer, csharpSourcePrimitiveTargetType("bool")])]) {
    assert.equal(selectCsharpScalarLiteralCarrier(overflow, storage) === undefined, true, "a missing admissible arm never bypasses integer range");
  }
});

test("pure C# source literals select exact integral and floating representations", () => {
  const compiled = compileEffectiveSource("native", `export function run(): boolean {
    const integer = 0;
    const fraction = 0.5;
    return integer === 0 && fraction === 0.5;
  }`);
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "integer", "int32");
  assertPrimitiveOccurrences(compiled, "fraction", "float64");
});

test("the explicit JS surface retains JavaScript numeric representation", () => {
  const compiled = compileEffectiveSource("js", "export function run(): boolean { const integer = 0; return integer === 0; }");
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "integer", "int32");
});

test("signed pure C# literals apply the same exact representation policy", () => {
  const compiled = compileEffectiveSource("native", "export function run(): boolean { const value = -2147483649; return value < 0; }");
  assertNativeEffectiveRefusal(compiled, "Source bigint literal is outside the exact 'int32' range.", "-2147483649");
});

test("annotated signed literals preserve the original exact negative values and selected floating destination", () => {
  const compiled = compileEffectiveSource("native", `import type { float64 } from "@tsonic/core/types.js";
    export function run(): boolean {
      const negative = -1;
      const wide: float64 = -2147483649;
      return negative === -1 && wide === -2147483649;
    }`);
  const text = acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "negative", "int32");
  assertPrimitiveOccurrences(compiled, "wide", "float64");
  assert.match(text, /-2147483649/u);
});

test("checked negative zero remains a floating native value on every surface", () => {
  for (const surface of ["native", "js"]) {
    for (const token of ["0", "0.0", "0e100"]) {
      const compiled = compileEffectiveSource(surface, `export function run(): boolean {
        const negative = -${token};
        const positive = 0;
        return negative === positive;
      }`);
      const text = acceptedEffectiveSource(compiled);
      const declarations = projectNodes(compiled, (node, ast) => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "negative");
      assert.equal(declarations.length, 1, "one original negative-zero declaration");
      const ast = compiled.targetSource.ast;
      const initializer = ast.as.AsVariableDeclaration(declarations[0])?.Initializer;
      const literal = analyzeSourceLiteralValues(ast, [ast.getSourceFile(declarations[0])]).literalValue.get(initializer);
      assert.equal(Object.is(literal?.number, -0), true, `${surface}/${token}: the actual checked authored literal retains its sign`);
      assertPrimitiveOccurrences(compiled, "negative", "float64");
      assertPrimitiveOccurrences(compiled, "positive", "int32");
      assert.match(text, /(?:-0(?:\.0)?D|Int64BitsToDouble|UInt64BitsToDouble|0x8000000000000000)/u,
        `${surface}/${token}: the emitted literal retains the actual negative-zero sign`);
    }
  }
});

test("C# integral and array-index policies remain distinct", () => {
  assert.equal(isCsharpIntegralTargetType(csharpSourcePrimitiveTargetType("int128")), true);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int128")), false);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("float64")), false);
});
