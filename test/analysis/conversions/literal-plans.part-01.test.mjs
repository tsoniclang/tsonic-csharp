import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpExactLiteralRequestCollector } from "../../../dist/analysis/conversions/literal-requests.js";
import { applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/index.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, checkCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram, analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/objects/required-records.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";
import { planCsharpExactLiteralRecipe } from "../../../dist/backend/planner/expressions/literal-conversions.js";
import { printCsharpExpression } from "../../../dist/print/source/printer.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { callEvidence, directProviderHost, providerBinding, providerDeclaration, providerFact, providerMethod,
  selectCsharpProviderCall, signatureRelation, targetParameter } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { primitive, primitives, literals, checkedPropertyKeys, providerAdapterCall, sealedProviderCallConversions } from "./literal-plans.fixtures.mjs";

test("native property-key literals retain exact tokens and the identical source enum entry", () => {
  const value = checkedPropertyKeys();
  const requests = value.names.map((expression, index) => ({ expression,
    target: index < 2 ? csharpStringTargetType() : primitive(index === 4 ? "decimal" : "int64"), propertyKey: value.selections[index] }));
  const index = analyzeCsharpExactLiteralSelections(analyzeSourceLiteralValues(value.source.ast, value.source.navigation.sourceFiles), requests, value.nodes);
  const selected = requests.map(request => index.exactLiteral.get(request.expression, request.target, "property-key"));
  assert.equal(selected.every(selection => selection?.kind === "resolved"), true, "all requested physical constants are admitted");
  assert.equal(selected[0].recipe.kind === "string" && selected[0].recipe.value === "plain", true, "ordinary property syntax is checked once");
  assert.equal(selected[1].recipe.kind === "string" && selected[1].recipe.value === "fixed", true, "computed const key has its actual string");
  for (const position of [2, 3]) assert.equal(selected[position].recipe.kind === "integer" && selected[position].recipe.value === 9007199254740993n,
    true, `${position}: native int64 key never rounds through a JavaScript number`);
  assert.equal(selected[4].recipe.kind === "float" && selected[4].recipe.precision === "decimal" && selected[4].recipe.token.significand === "1.0",
    true, "authored decimal key scale is retained in its token");
  const enumKey = value.selections[3].constant;
  assert.equal(enumKey.kind, "enum-member", "an enum key is not fabricated authored-literal evidence");
  assert.equal(enumKey.entry === value.source.semantics.enumConstants.get(enumKey.entry.declaration), true,
    "the exact frozen source enum-index entry is transported, not re-evaluated");
  assert.equal(Object.isFrozen(enumKey.entry) && Object.isFrozen(index.exactLiteral) && selected.every(Object.isFrozen), true,
    "source constants and native literal publications remain immutable");
  assert.equal(selectCsharpExactPropertyKeyConversion(value.selections[2], primitive("int32")).kind, "rejected",
    "the same exact wide key still respects the native int32 range");
  assert.equal(selectCsharpExactPropertyKeyConversion(value.selections[0], primitive("int64")).kind, "rejected",
    "a checked string key never becomes an inferred numeric conversion");
});

test("an exact property-key requirement cannot borrow the same node's value literal", () => {
  const value = checkedPropertyKeys();
  const expression = value.names[2];
  const target = primitive("int64");
  const literalValues = analyzeSourceLiteralValues(value.source.ast, value.source.navigation.sourceFiles);
  const onlyValue = analyzeCsharpExactLiteralSelections(literalValues, [{ expression, target }], value.nodes);
  assert.equal(onlyValue.exactLiteral.get(expression, target)?.kind, "resolved", "the sibling value-purpose record really exists");
  assert.equal(onlyValue.exactLiteral.get(expression, target, "property-key") === undefined, true,
    "the property-key purpose never falls back to value evidence");
  assert.throws(() => assertCsharpRequiredRecords({ exactLiteral: onlyValue.exactLiteral }, [{ family: "exactLiteral", subject: expression,
    target, role: "property-key", construct: "native dictionary key", producer: "analyzeCsharpNativeDemand" }]),
  error => error instanceof Error && error.message.includes("Required C# semantic plan 'exactLiteral'"),
  "the pre-seal contract rejects the exact missing key purpose");
});

test("exact property-key floating tokens render native D without parsing or an intermediate float", () => {
  const value = checkedPropertyKeys();
  for (const precision of ["float16", "float32", "float64", "decimal"]) {
    const admitted = selectCsharpExactPropertyKeyConversion(value.selections[4], primitive(precision));
    assert.equal(admitted.kind === "resolved", true, `${precision}: the native token is admitted`);
    const planned = planCsharpExactLiteralRecipe(undefined, admitted.recipe);
    assert.equal(planned.kind === "resolved", true, `${precision}: the exact token renders`);
    const text = printCsharpExpression(planned.expression);
    const suffix = precision === "float32" ? "F" : precision === "decimal" ? "M" : "D";
    assert.equal(precision === "float16" ? text === "(Half)1D" : text.endsWith(`1.0${suffix}`),
      true, `${precision}: the exact native value survives`);
    assert.equal(precision !== "float16" || planned.expression.kind === "CastExpression" &&
      admitted.recipe.bits === 0x3c00 && planned.expression.expression.kind === "NumericLiteralExpression" &&
      planned.expression.expression.token === admitted.recipe.token && planned.expression.expression.suffix === "D", true,
    `${precision}: Half renders the canonical Double token already sealed for its selected bits`);
  }
});

test("native dictionary construction and lookup agree on the exact selected double key", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { float64, int32 } from "@tsonic/core/types.js";
    export function run(): boolean {
      const values: Record<float64, int32> = { 1.0000000000000002: 7 };
      return values[1.0000000000000002] === 7;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("1.0000000000000002D"), true, "native construction prints the exact double token");
  executeCsharpConstruction(compiled, "exact-native-double-dictionary-key");
});

test("Half authored midpoint neighbors follow native Double-to-Half semantics in Node and C#", { timeout: 300_000 }, () => {
  const spellings = ["1.00048828124999999999999999999999", "1.00048828125000000000000000000001", "-0", "5.9604644775390625e-8"];
  const expected = [0x3c00, 0x3c00, 0x8000, 1];
  const nodeBits = spellings.map(token => new Uint16Array(new Float16Array([Math.f16round(Number(token))]).buffer)[0]);
  assert.deepEqual(nodeBits, expected, "Node parses each authored Double before rounding it to native Half");
  const selected = checkedSourceLiteralValues(spellings).map(value => selectCsharpExactLiteralConversion(value, primitive("float16")));
  const expressions = selected.map((selection, index) => {
    assert.equal(selection.kind === "resolved" && selection.recipe.kind === "float" && selection.recipe.bits === expected[index], true,
      `${index}: the checked Double-to-Half value is selected before rendering`);
    const planned = planCsharpExactLiteralRecipe(undefined, selection.recipe);
    assert.equal(planned.kind, "resolved", `${index}: the planner consumes the sealed recipe`);
    return printCsharpExpression(planned.expression);
  });
  const compiled = compileCsharpSource({ sourceText: "export function run(): boolean { return true; }" });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "exact-native-half-midpoints", false, false, [], "using System;\n" + expressions.map((expression, index) => `
    if (System.BitConverter.HalfToUInt16Bits(${expression}) != ${expected[index]})
      throw new System.Exception("exact native Half value ${index}");`).join("\n"));
});

test("shorthand property keys never replace the same source node's runtime value", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    const foo = "bar";
    export const record: Record<string, string> = { foo };
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const nodes = [];
  const visit = node => { nodes.push(node); program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  const shorthand = nodes.find(node => program.source.ast.is.IsShorthandPropertyAssignment(node));
  const name = program.source.ast.name(shorthand);
  const use = program.records.nativeExpression.get(name)?.use;
  assert.equal(use !== undefined && use.kind !== "erased" && use.literal === undefined, true,
    "the runtime value remains a real identifier read, not the key's string literal");
  const target = csharpStringTargetType();
  const key = program.records.exactLiteral.get(name, target, "property-key");
  assert.equal(key?.kind === "resolved" && key.recipe.kind === "string" && key.recipe.value === "foo", true,
    "the exact same node and target separately carry the physical key");
  assert.equal(program.records.exactLiteral.get(name, target)?.kind, "not-applicable", "ordinary value lookup does not borrow the key recipe");
});

test("actual native dictionary construction carries its computed string key recipe to emission", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    const selected = "key" as const;
    export const text: Record<string, int32> = { [selected]: 7 };
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const objects = [];
  const visit = node => {
    if (program.source.ast.is.IsObjectLiteralExpression(node)) objects.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  const bindings = objects.flatMap(expression => {
    const use = program.records.nativeExpression.get(expression)?.use;
    assert.equal(use !== undefined && use.kind !== "erased" && Object.isFrozen(use.propertyKeys), true,
      "each physical dictionary carries its own immutable key binding list");
    return use.propertyKeys;
  });
  assert.equal(bindings.length, 1, "the actual dictionary member has one admitted key");
  assert.equal(bindings.some(binding => binding.literal.kind === "string" && binding.literal.value === "key"), true,
    "the computed source key reaches its exact native construction");
  for (const binding of bindings) assert.equal(program.records.exactLiteral.get(binding.name, binding.target, "property-key")?.recipe === binding.literal,
    true, "native use carries the identical admitted literal recipe");
});

test("checked wide key recipes render and execute in an actual native Dictionary<long, int>", { timeout: 300_000 }, () => {
  const value = checkedPropertyKeys();
  const target = primitive("int64");
  const index = analyzeCsharpExactLiteralSelections(analyzeSourceLiteralValues(value.source.ast, value.source.navigation.sourceFiles),
    [2, 3].map(position => ({ expression: value.names[position], target, propertyKey: value.selections[position] })), value.nodes);
  const expressions = [2, 3].map(position => {
    const admitted = index.exactLiteral.get(value.names[position], target, "property-key");
    assert.equal(admitted?.kind === "resolved" && admitted.recipe.kind === "integer" && admitted.recipe.width === "int64" &&
      admitted.recipe.value === 9007199254740993n, true, `${position}: the native wide key never becomes a rounded double`);
    const planned = planCsharpExactLiteralRecipe(undefined, admitted.recipe);
    assert.equal(planned.kind === "resolved", true, `${position}: exact native long key syntax is proven`);
    return printCsharpExpression(planned.expression);
  });
  const output = expressions.join("\n");
  assert.equal(output.includes("9007199254740993L") && !output.includes("9007199254740992"), true,
    "C# syntax retains the exact selected native long constant");
  const compiled = compileCsharpSource({ sourceText: "export function run(): boolean { return true; }" });
  assertCsharpCompilationSucceeded(compiled);
  const nativeProgram = expressions.map((expression, index) => `{
    var values = new System.Collections.Generic.Dictionary<long, int> { [${expression}] = 9 };
    if (values.Count != 1 || !values.TryGetValue(9007199254740993L, out int actual) || actual != 9 || values.ContainsKey(9007199254740992L))
      throw new System.Exception("exact native long key ${index}");
  }`).join("\n");
  executeCsharpConstruction(compiled, "exact-checked-native-long-dictionary-key", false, false, [], nativeProgram);
});

test("Record<int64, int32> retains its distinct checked source key constraint", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    export const wide: Record<int64, int32> = { 9007199254740993: 9 };
  ` });
  assert.equal(checked.sourceDiagnosticsText.includes("TS2344") && checked.sourceDiagnosticsText.includes("bigint"), true,
    "the source Record constraint is not evidence of native key rounding or a new bigint Record capability");
});

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
test(`${surface} decimal dictionary keys retain a source integer above the float64 precision boundary`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { decimal, int32 } from "@tsonic/core/types.js";
      export function create(): Record<decimal, int32> { return { 9007199254740993: 7 }; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(output.includes("9007199254740993M") && !output.includes("9007199254740992"), true,
      `${surface}: the exact native decimal value never rounds through double`);
    executeCsharpConstruction(compiled, `${surface}-checked-wide-native-decimal-dictionary-key`, false, false, [], `
      var values = Tsonic.Generated.Index.create();
      if (values.Count != 1 || !values.TryGetValue(9007199254740993M, out int value) || value != 7 || values.ContainsKey(9007199254740992M))
        throw new System.Exception("exact native wide decimal key");
    `);
  });

test(`${surface} checked computed string keys preserve the actual dictionary lookup`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      const selected = "fixed" as const;
      export function create(): Record<string, int32> { return { [selected]: 7 }; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `${surface}-checked-native-string-dictionary-key`, false, false, [], `
      var values = Tsonic.Generated.Index.create();
      if (values.Count != 1 || !values.TryGetValue("fixed", out int value) || value != 7)
        throw new System.Exception("checked native string key");
    `);
  });

test(`${surface} decimal dictionary keys retain their authored scale in native execution`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { decimal, int32 } from "@tsonic/core/types.js";
      export function create(): Record<decimal, int32> { return { 1.0: 7 }; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(output.includes("1.0M"), true, `${surface}: native decimal syntax retains the exact source scale`);
    executeCsharpConstruction(compiled, `${surface}-checked-native-decimal-dictionary-scale`, false, false, [], `
      var values = Tsonic.Generated.Index.create();
      if (values.Count != 1) throw new System.Exception("native decimal key count");
      foreach (decimal key in values.Keys) {
        if (key != 1.0M || ((decimal.GetBits(key)[3] >> 16) & 255) != 1)
          throw new System.Exception("authored native decimal key scale");
      }
    `);
  });
}

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
test(`${surface} decimal dictionary keys retain a source integer above the float64 precision boundary`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { decimal, int32 } from "@tsonic/core/types.js";
      export function create(): Record<decimal, int32> { return { 9007199254740993: 7 }; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(output.includes("9007199254740993M") && !output.includes("9007199254740992"), true,
      `${surface}: the exact native decimal value never rounds through double`);
    executeCsharpConstruction(compiled, `${surface}-checked-wide-native-decimal-dictionary-key`, false, false, [], `
      var values = Tsonic.Generated.Index.create();
      if (values.Count != 1 || !values.TryGetValue(9007199254740993M, out int value) || value != 7 || values.ContainsKey(9007199254740992M))
        throw new System.Exception("exact native wide decimal key");
    `);
  });

test(`${surface} checked computed string keys preserve the actual dictionary lookup`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      const selected = "fixed" as const;
      export function create(): Record<string, int32> { return { [selected]: 7 }; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `${surface}-checked-native-string-dictionary-key`, false, false, [], `
      var values = Tsonic.Generated.Index.create();
      if (values.Count != 1 || !values.TryGetValue("fixed", out int value) || value != 7)
        throw new System.Exception("checked native string key");
    `);
  });
}
