import assert from "node:assert/strict";
import { test } from "node:test";
import { csharpSourcePrimitiveTargetType, isCsharpArrayIndexTargetType, isCsharpIntegralTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { acceptedEffectiveSource, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import * as literalPolicy from "../../../dist/policy/conversions/literals.js";
import { csharpStringTargetType, csharpBigIntegerTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

test("published scalar construction retains one physical payload before every declared storage form", () => {
  const cases = [
    ["minimum signed integer", "-2147483648", "int32", csharpSourcePrimitiveTargetType("int32")],
    ["half", "1.5", "float16", csharpSourcePrimitiveTargetType("float16")],
    ["single", "1.5", "float32", csharpSourcePrimitiveTargetType("float32")],
    ["double", "1.5", "float64", csharpSourcePrimitiveTargetType("float64")],
    ["decimal", "1.5", "decimal", csharpSourcePrimitiveTargetType("decimal")],
    ["negative zero", "-0", "float64", csharpSourcePrimitiveTargetType("float64")],
    ["character", '"x"', "char", csharpSourcePrimitiveTargetType("char")],
    ["string", '"text"', "string", csharpStringTargetType()],
    ["boolean", "true", "boolean", csharpSourcePrimitiveTargetType("bool")],
    ["bigint", "1n", "bigint", csharpBigIntegerTargetType()],
  ];
  assert.equal(Object.hasOwn(literalPolicy, "selectCsharpScalarLiteralCarrier"), false,
    "the retired Native scalar arm chooser has no compatibility export");
  for (const surface of ["native", "js"]) for (const [name, spelling, declared, payload] of cases) {
    const other = declared === "boolean" ? "string" : "boolean";
    for (const [form, storage] of [["direct", declared], ["nullable", `${declared} | undefined`],
      ["union", `${declared} | ${other}`], ["nullable union", `${declared} | ${other} | undefined`]]) {
      const imported = ["string", "boolean", "bigint"].includes(declared) ? ""
        : `import type { ${declared} } from "@tsonic/core/types.js";`;
      const compiled = compileEffectiveSource(surface, `${imported} export function run(): (${storage})[] { return [${spelling}]; }`);
      acceptedEffectiveSource(compiled);
      const source = compiled.source;
      const ast = source.ast;
      const aggregate = projectNodes(compiled, node => ast.is.IsArrayLiteralExpression(node))[0];
      const expression = ast.elements(aggregate)[0];
      const evidence = resolvedSourceValue(source.facts.values.type(expression), "the original scalar occurrence");
      source.facts.descriptors.assertEvidence(evidence);
      const scalar = source.facts.descriptors.scalarLiteral(evidence);
      assert.equal(scalar.kind, "present", `${surface}/${name}/${form}: one authentic Source singleton is retained`);
      assert.equal(literalPolicy.csharpScalarLiteralIsRepresentableAs(scalar.value, payload), true,
        `${surface}/${name}/${form}: the original scalar fits the exact selected Native creation ABI`);
      assert.equal(source.facts.descriptors.scalarLiteral(evidence).value === scalar.value, true,
        `${surface}/${name}/${form}: storage forms do not manufacture a second literal or Source classifier`);
      assert.equal(targetTypeRefEquals(compiled.result.program.records.valueRead.get(expression)?.value, payload), true,
        `${surface}/${name}/${form}: the Native read consumes the same physical payload`);
    }
  }
  const nonliteral = compileEffectiveSource("native", `import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32): int32 { return value; }`);
  acceptedEffectiveSource(nonliteral);
  const nonliteralReturn = projectNodes(nonliteral, (node, ast) => ast.is.IsReturnStatement(node))[0];
  const nonliteralValue = nonliteral.source.ast.as.AsReturnStatement(nonliteralReturn)?.Expression;
  const nonliteralEvidence = resolvedSourceValue(nonliteral.source.facts.values.type(nonliteralValue), "actual parameter read");
  assert.equal(nonliteral.source.facts.descriptors.scalarLiteral(nonliteralEvidence).kind, "none",
    "a nonliteral read supplies no singleton scalar receipt");
  const unannotated = compileEffectiveSource("native", "export function run() { return -2147483648; }");
  acceptedEffectiveSource(unannotated);
  const ownReturn = projectNodes(unannotated, (node, ast) => ast.is.IsReturnStatement(node))[0];
  const ownValue = unannotated.source.ast.as.AsReturnStatement(ownReturn)?.Expression;
  assert.equal(targetTypeRefEquals(unannotated.result.program.records.valueRead.get(ownValue)?.value,
    csharpSourcePrimitiveTargetType("int64")), true, "no authored storage still keeps the Source int64 creation default");
  const aggregate = compileEffectiveSource("native", "export function run() { return [1]; }");
  acceptedEffectiveSource(aggregate);
  const array = projectNodes(aggregate, (node, ast) => ast.is.IsArrayLiteralExpression(node))[0];
  assert.equal(aggregate.result.program.records.valueRead.get(array)?.value.kind === "array", true,
    "aggregate construction retains its separate array admission owner");
  for (const storage of ["int32", "int32 | undefined", "int32 | boolean"]) {
    const overflow = compileEffectiveSource("native", `import type { int32 } from "@tsonic/core/types.js";
      export function run(): (${storage})[] { return [2147483648]; }`);
    const issues = overflow.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "one exact Native storage law rejects the original out-of-range scalar");
    const issue = issues[0];
    assert.equal(issue.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
    assert.equal(issue.source, "tsonic-csharp");
    const ast = overflow.source.ast;
    const range = ast.authoredRange(issue.sourceNode);
    assert.equal(range.kind, "authored");
    assert.equal(ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end), "2147483648");
    const evidence = resolvedSourceValue(overflow.source.facts.values.type(issue.sourceNode), "valid original Source scalar");
    assert.equal(overflow.source.facts.descriptors.scalarLiteral(evidence).kind, "present",
      "an actual Native range refusal is not a recoded Source refusal");
    assert.equal(overflow.result.program === undefined && overflow.artifacts.size === 0, true,
      "an out-of-range existing Native slot publishes no partial output");
  }
});

test("pure C# source literals select exact integral and floating representations", () => {
  const compiled = compileEffectiveSource("native", `export function run(): boolean {
    const integer = 0;
    const fraction = 0.5;
    return integer === 0 && fraction === 0.5;
  }`);
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "integer", "int64");
  assertPrimitiveOccurrences(compiled, "fraction", "float64");
});

test("the explicit JS surface retains the same native integer creation representation", () => {
  const compiled = compileEffectiveSource("js", "export function run(): boolean { const integer = 0; return integer === 0; }");
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "integer", "int64");
});

test("signed pure C# literals apply the same exact representation policy", () => {
  const compiled = compileEffectiveSource("native", "export function run(): boolean { const value = -2147483649; return value < 0; }");
  const text = acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "value", "int64");
  assert.equal(text.includes("long value = -2147483649"), true);
});

test("annotated signed literals preserve the original exact negative values and selected floating destination", () => {
  const compiled = compileEffectiveSource("native", `import type { float64 } from "@tsonic/core/types.js";
    export function run(): boolean {
      const negative = -1;
      const wide: float64 = -2147483649;
      return negative === -1 && wide === -2147483649;
    }`);
  const text = acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "negative", "int64");
  assertPrimitiveOccurrences(compiled, "wide", "float64");
  assert.match(text, /-2147483649/u);
});

test("integer negative zero defaults to int64 while written floating zero retains its sign on every surface", () => {
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
      const ast = compiled.source.ast;
      const initializer = ast.as.AsVariableDeclaration(declarations[0])?.Initializer;
      const evidence = resolvedSourceValue(compiled.source.facts.values.type(initializer), "original signed-zero occurrence");
      const scalar = compiled.source.facts.descriptors.scalarLiteral(evidence);
      assert.equal(scalar.kind === "present" && scalar.value.kind === "number" && scalar.value.value.kind === "authored" &&
        scalar.value.value.token.coefficient === 0n && scalar.value.value.token.negative, true,
        `${surface}/${token}: the original singleton token retains its sign without a Native parser`);
      assertPrimitiveOccurrences(compiled, "negative", token === "0" ? "int64" : "float64");
      assertPrimitiveOccurrences(compiled, "positive", "int64");
      if (token === "0") assert.match(text, /long negative = 0L;/u, `${surface}: integer creation has one native zero`);
      else assert.match(text, /(?:-0(?:\.0)?D|Int64BitsToDouble|UInt64BitsToDouble|0x8000000000000000)/u,
        `${surface}/${token}: an authored floating literal retains its negative-zero sign`);
    }
  }
});

test("C# integral and array-index policies remain distinct", () => {
  assert.equal(isCsharpIntegralTargetType(csharpSourcePrimitiveTargetType("int128")), true);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int128")), false);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(isCsharpArrayIndexTargetType(csharpSourcePrimitiveTargetType("float64")), false);
});
