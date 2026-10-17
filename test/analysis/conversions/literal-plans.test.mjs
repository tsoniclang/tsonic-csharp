import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpExactLiteralRequestCollector } from "../../../dist/analysis/conversions/literal-requests.js";
import { applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, checkCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram, analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/required-records.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";
import { planCsharpExactLiteralRecipe } from "../../../dist/backend/planner/expressions/literal-conversions.js";
import { printCsharpExpression } from "../../../dist/print/source/printer.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { callEvidence, directProviderHost, providerBinding, providerDeclaration, providerFact, providerMethod,
  selectCsharpProviderCall, signatureRelation, targetParameter } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const primitives = ["bool", "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int",
  "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"];

function literals(entries) {
  const values = new Map(entries);
  return Object.freeze({ literalValue: Object.freeze({ get: node => values.get(node) }) });
}

function checkedPropertyKeys() {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    import type { decimal } from "@tsonic/core/types.js";
    enum NumericKey { Wide = 9007199254740993 }
    const selected = "fixed" as const;
    export const keys = { plain: "a", [selected]: "b", 1.0: "e" };
    export const wideKeys: Record<decimal, string> = { 9007199254740993: "c" };
    export const enumKeys: Record<decimal, string> = { [NumericKey.Wide]: "d" };
  ` });
  assert.equal(checked.sourceDiagnosticsText === "" && checked.extensionDiagnostics.length === 0, true,
    `the full source key control passes checked admission: ${checked.sourceDiagnosticsText}; ${checked.extensionDiagnostics.map(({ message }) => message).join("; ")}`);
  const source = createTargetSourceProgram(checked.source);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of source.navigation.sourceFiles) visit(file);
  const object = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "keys");
  const expression = source.ast.as.AsVariableDeclaration(object).Initializer;
  const ordinary = source.ast.properties(expression).map(property => source.ast.name(property));
  const wideObject = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "wideKeys");
  const wideExpression = source.ast.as.AsVariableDeclaration(wideObject).Initializer;
  const enumObject = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "enumKeys");
  const enumExpression = source.ast.as.AsVariableDeclaration(enumObject).Initializer;
  const names = [ordinary[0], ordinary[1], source.ast.name(source.ast.properties(wideExpression)[0]),
    source.ast.name(source.ast.properties(enumExpression)[0]), ordinary[2]];
  const selections = names.map(name => source.semantics.forNode(name).propertyNames.get(name));
  assert.equal(selections.every(selection => selection?.kind === "resolved"), true, "every original name has one canonical constant");
  return { source, nodes, names, selections };
}

test("native property-key literals retain exact tokens and the identical source enum entry", () => {
  const value = checkedPropertyKeys();
  const requests = value.names.map((expression, index) => ({ expression,
    target: index < 2 ? csharpStringTargetType() : primitive(index === 4 ? "decimal" : "int64"), propertyKey: value.selections[index] }));
  const index = analyzeCsharpExactLiteralSelections(analyzeSourceLiteralValues(value.source.ast, value.source.navigation.sourceFiles), requests);
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
  const onlyValue = analyzeCsharpExactLiteralSelections(literalValues, [{ expression, target }]);
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
    assert.equal(text.endsWith(`1.0${suffix}`), true, `${precision}: the authored token and native suffix survive`);
    assert.equal(precision !== "float16" || planned.expression.kind === "CastExpression" &&
      planned.expression.expression.token === admitted.recipe.token && planned.expression.expression.suffix === "D", true,
    `${precision}: Half does not round through a float32 intermediary`);
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

test("shorthand property keys never replace the same source node's runtime value", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    const foo = "bar";
    export const record: Record<string, string> = { foo };
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const nodes = [];
  const visit = node => { nodes.push(node); program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of program.sourceFiles) visit(file);
  const shorthand = nodes.find(node => program.source.ast.is.IsShorthandPropertyAssignment(node));
  const name = program.source.ast.name(shorthand);
  const use = program.records.nativeUse.expression(name)?.use;
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
  for (const file of program.sourceFiles) visit(file);
  const bindings = objects.flatMap(expression => {
    const use = program.records.nativeUse.expression(expression)?.use;
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
    [2, 3].map(position => ({ expression: value.names[position], target, propertyKey: value.selections[position] })));
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

for (const surface of ["native", "js"]) {
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

for (const surface of ["native", "js"]) for (const [type, value] of [["int8", "128"], ["int8", "(128)"], ["float16", "65520"]]) {
  test(`${surface} rejected ${type} literal ${value} retains its precise native refusal before sealing`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { ${type} } from "@tsonic/core/types.js";
      export function run(): ${type} { return ${value}; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the native literal refusal is not a source checker substitution");
    const diagnostics = compiled.result.diagnostics;
    assert.equal(diagnostics.length, 1, "one exact native refusal, never an internal pending invariant");
    const source = createTargetSourceProgram(compiled.source);
    const literal = analyzeSourceLiteralValues(source.ast, source.sourceFiles).literalValue.get(diagnostics[0].sourceNode);
    const selected = selectCsharpExactLiteralConversion(literal, primitive(type));
    assert.equal(selected.kind === "rejected" && diagnostics[0].code === "CSHARP_UNSUPPORTED_AST" &&
      diagnostics[0].message === selected.reason, true, "the completed native literal owner supplies the exact retained reason");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "refusal precedes publication and native planning");
  });
}

test("exact literal selections exist only at requested keys and equal the native rule", () => {
  const wide = Object.freeze({});
  const text = Object.freeze({});
  const other = Object.freeze({});
  const wideValue = Object.freeze({ form: "bigint", integer: 3n });
  const textValue = Object.freeze({ form: "string", text: "x" });
  const index = analyzeCsharpExactLiteralSelections(literals([[wide, wideValue], [text, textValue]]), [
    Object.freeze({ expression: wide }),
    Object.freeze({ expression: wide, target: primitive("int64") }),
    Object.freeze({ expression: wide, target: csharpNullableTargetType(primitive("uint128")) }),
    Object.freeze({ expression: text, target: csharpStringTargetType() }),
    Object.freeze({ expression: other, target: primitive("int64") }),
  ]);
  const exactLiteral = index.exactLiteral;
  assert.deepEqual(exactLiteral.get(wide, undefined), { kind: "not-applicable" }, "the explicit intrinsic request");
  for (const target of [primitive("int64"), csharpNullableTargetType(primitive("uint128"))]) {
    assert.deepEqual(exactLiteral.get(wide, target), selectCsharpExactLiteralConversion(wideValue, target), targetTypeRefKey(target));
  }
  assert.deepEqual(exactLiteral.get(text, csharpStringTargetType()), { kind: "source-representation" });
  assert.equal(exactLiteral.get(text, undefined), undefined, "no intrinsic request, no record");
  for (const name of primitives) {
    assert.equal(exactLiteral.get(text, primitive(name)), undefined, `${name}: no unrequested native table`);
  }
  assert.equal(exactLiteral.get(wide, primitive("int32")), undefined, "an unrequested target stays unknown");
  const notLiteral = exactLiteral.get(other, primitive("int64"));
  assert.deepEqual(notLiteral, { kind: "not-applicable" }, "a node without a literal datum is never a literal conversion");
  assert.equal(Object.isFrozen(notLiteral) && exactLiteral.get(Object.freeze({}), undefined) === notLiteral, true);
});

test("exact literal selections are materialized once per canonical key and published read-only", () => {
  const node = Object.freeze({});
  const value = Object.freeze({ form: "bigint", integer: 1n << 40n });
  const first = csharpNullableTargetType(primitive("int64"));
  const second = csharpNullableTargetType(primitive("int64"));
  const requests = [Object.freeze({ expression: node, target: first }), Object.freeze({ expression: node, target: second })];
  const index = analyzeCsharpExactLiteralSelections(literals([[node, value]]), requests);
  const selected = index.exactLiteral.get(node, first);
  assert.equal(selected.kind, "resolved");
  assert.equal(first !== second && index.exactLiteral.get(node, second) === selected, true, "one selection per canonical key");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.recipe), true, "frozen selection data");
  assert.equal(Object.isFrozen(index) && Object.isFrozen(index.exactLiteral), true, "frozen index");
  assert.deepEqual(Object.keys(index), ["exactLiteral"]);
  assert.deepEqual(Object.keys(index.exactLiteral), ["get"], "get-only family");
  requests.push(Object.freeze({ expression: node, target: primitive("uint64") }));
  assert.equal(index.exactLiteral.get(node, primitive("uint64")), undefined, "requests after materialization are not read");
});

test("exact native token plans are frozen once without treating a refused candidate as an actual use", () => {
  const [value] = checkedSourceLiteralValues(["1e39"]);
  const node = Object.freeze({});
  const index = analyzeCsharpExactLiteralSelections(literals([[node, value]]), [
    { expression: node, target: primitive("float32") }, { expression: node, target: primitive("float64") },
    { expression: node, target: primitive("float32") },
  ]);
  assert.deepEqual(index.exactLiteral.get(node, primitive("float32")),
    { kind: "rejected", reason: "Source numeric literal is outside the 'float32' range." });
  assert.deepEqual(index.exactLiteral.get(node, primitive("float64")), { kind: "source-representation" });
  assert.equal(index.exactLiteral.get(node, primitive("float32")) === index.exactLiteral.get(node, primitive("float32")), true,
    "duplicate requests read one materialized selection");
  const [decimal] = checkedSourceLiteralValues(["9007199254740993"]);
  const exact = analyzeCsharpExactLiteralSelections(literals([[node, decimal]]), [{ expression: node, target: primitive("decimal") }]);
  const selected = exact.exactLiteral.get(node, primitive("decimal"));
  assert.equal(selected.kind === "resolved" && selected.recipe.token.significand === "9007199254740993", true,
    "a selected native decimal keeps its authored value above 2^53");
  assert.equal(Object.isFrozen(selected.recipe.token), true, "the token is immutable published data");
});

test("exact literal requests come from literal reads, the unary result and every literal step of a prepared conversion", () => {
  const node = Object.freeze({});
  const other = Object.freeze({});
  const collector = createCsharpExactLiteralRequestCollector(literals([[node, Object.freeze({ form: "numeric", number: 1, integer: 1n })]]));
  const int32 = primitive("int32");
  const int64 = primitive("int64");
  const float32 = primitive("float32");
  const literal = Object.freeze({ kind: "implicit", proof: "literal" });
  const unaryReads = [];
  const operations = { unaryOperation: Object.freeze({ get: expression => {
    unaryReads.push(expression);
    return expression === node ? { target: { kind: "resolved", resultType: int64 } } : undefined;
  } }) };
  collector.requestReads(other, [int32], [int64], operations);
  collector.requestConversion(other, int32, int64, literal);
  assert.equal(collector.requests.length + unaryReads.length, 0, "a node without a literal datum requests and reads nothing");
  collector.requestReads(node, [int32], [float32], operations);
  collector.requestConversion(node, int32, int64, literal);
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({ kind: "js-value-box" }));
  collector.requestConversion(node, csharpNullableTargetType(int32), csharpNullableTargetType(float32), Object.freeze({
    kind: "nullable-map", sourceElement: int32, targetElement: float32, conversion: literal }));
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({
    kind: "implicit", proof: "runtime-union-arm", armIndex: 0, armType: int64, sourceToArm: literal }));
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({
    kind: "provider-argument-adapter", adapter: Object.freeze({ inputType: float32, resultType: int64 }),
    sourceToInput: literal, resultToTarget: Object.freeze({ kind: "js-value-box" }) }));
  collector.requestConversion(node, int32, int64, Object.freeze({ kind: "implicit", proof: "numeric" }));
  const keys = collector.requests.map(request => request.target === undefined ? "intrinsic" : targetTypeRefKey(request.target));
  assert.deepEqual(keys, ["intrinsic", int32, float32, int64, int64, int32, float32, int64, int64, float32].map(type =>
    type === "intrinsic" ? type : targetTypeRefKey(type)), "intrinsic, source, expected and unary result reads, then conversion steps");
  assert.equal(collector.requests.every(request => request.expression === node && Object.isFrozen(request)), true);
});

test("a compiled program publishes exact literal selections at its actual requested targets", () => {
  const result = compileCsharpSource({ surface: "native", sourceText: `
    import type { int64, int128, float32 } from "@tsonic/core/types.js";
    export const wide: int64 = 3n;
    export const asserted = 5n as int128;
    export const text: string = "x";
    export const zero: float32 = -0;
  ` });
  assertCsharpCompilationSucceeded(result);
  const { program } = result.result;
  const records = program.records;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const find = predicate => {
    const found = nodes.filter(node => { const value = records.literalValue.get(node); return value !== undefined && predicate(value); });
    assert.equal(found.length, 1);
    return found[0];
  };
  const wide = find(value => value.form === "bigint" && value.integer === 3n);
  const asserted = find(value => value.form === "bigint" && value.integer === 5n);
  const text = find(value => value.form === "string" && value.text === "x");
  const zero = find(value => value.form === "prefix-unary" && Object.is(value.number, -0));
  assert.deepEqual(records.exactLiteral.get(wide, primitive("int64")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int64"), width: "int64", value: 3n } });
  assert.deepEqual(records.exactLiteral.get(asserted, primitive("int128")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int128"), width: "int128", value: 5n } });
  assert.deepEqual(records.exactLiteral.get(text, csharpStringTargetType()), { kind: "source-representation" });
  assert.deepEqual(records.exactLiteral.get(zero, primitive("float32")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float32"), precision: "float32",
      token: { significand: "0" }, negative: true } });
  for (const node of [wide, asserted, text, zero]) {
    assert.deepEqual(records.exactLiteral.get(node, undefined), { kind: "not-applicable" }, "the intrinsic request of a visited literal");
  }
  assert.equal(primitives.filter(name => records.exactLiteral.get(text, primitive(name)) !== undefined).length, 0,
    "a string literal has no native primitive record it was never requested at");
  assert.equal(records.exactLiteral.get(wide, primitive("uint128")), undefined, "an unrequested target stays unknown");
  assert.deepEqual(records.exactLiteral.get(program.sourceFiles[0], primitive("int64")), { kind: "not-applicable" });
  assert.equal(Object.isFrozen(records.exactLiteral) && !Object.hasOwn(records.exactLiteral, "set"), true);
});

test("a provider argument adapter's literal input step is requested by the selected call and rendered from its record", () => {
  const planned = Object.freeze({ kind: "LiteralExpression", value: 30 });
  const cases = [
    ["int32", "int16", { kind: "resolved", recipe: { kind: "integer", target: primitive("int16"), width: "int16", value: 30n } },
      { kind: "CastExpression", type: { kind: "PredefinedType", name: "short" }, expression: { kind: "LiteralExpression", value: 30 } }],
    ["float64", "int64", { kind: "resolved", recipe: { kind: "integer", target: primitive("int64"), width: "int64", value: 30n } },
      { kind: "IntegerLiteralExpression", digits: "30", suffix: "L" }],
  ];
  for (const [readName, inputName, record, input] of cases) {
    const fixture = providerAdapterCall(primitive(readName), primitive(inputName));
    const mapping = fixture.selected.call.argumentMappings[0];
    assert.equal(mapping.conversion.kind === "provider-argument-adapter" && mapping.conversion.sourceToInput.proof === "literal" &&
      mapping.conversion.resultToTarget.kind === "identity", true, `${readName} to ${inputName}: policy selects the adapter with a literal input step`);
    const requests = sealedProviderCallConversions(fixture).prepared.exactLiteralRequests
      .filter(request => request.expression === fixture.literal);
    assert.deepEqual(requests.map(request => request.target === undefined ? "intrinsic" : targetTypeRefKey(request.target)),
      [primitive(inputName), "intrinsic", primitive(readName), fixture.counter].map(type => type === "intrinsic" ? type : targetTypeRefKey(type)),
      `${inputName}: the selected call requests the adapter input; reads and the expected type request the rest`);
    const exactLiteral = analyzeCsharpExactLiteralSelections(fixture.host.literalValues, requests).exactLiteral;
    assert.deepEqual(exactLiteral.get(fixture.literal, primitive(inputName)), record, `${inputName}: the record at the adapter input`);
    const diagnostics = [];
    const rendered = applyCsharpConversionSelection(fixture.literal, fixture.sourceFile, {
      program: { records: { exactLiteral } }, scope: { typeParameterNames: undefined },
    }, diagnostics, mapping.sourceType, mapping.targetType, mapping.conversion, planned);
    assert.deepEqual(rendered, { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "MyLib" }, name: "Counter" }, name: "From" },
    arguments: [{ kind: "Argument", expression: input }] }, `${inputName}: the planner renders the adapter call`);
    assert.equal(diagnostics.length, 0, `${inputName}: no planner diagnostics`);
  }
});

test("exact literal requests are private frozen preparation data, not sealed conversion readers", () => {
  const { analysis, conversions, prepared } = sealedProviderCallConversions(providerAdapterCall(primitive("int32"), primitive("int16")));
  assert.equal(Object.hasOwn(analysis.classifications, "exactLiteralRequests"), false, "open classifications publish no request list");
  assert.equal(Array.isArray(prepared.exactLiteralRequests) && Object.isFrozen(prepared.exactLiteralRequests), true,
    "the private completed request list is frozen");
  assert.equal(Object.hasOwn(conversions, "exactLiteralRequests"), false, "the final conversion port carries no preparation state");
});

function providerAdapterCall(read, inputType) {
  const counter = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "MyLib.Counter",
    csharpRender: Object.freeze({ kind: "named", namespace: Object.freeze(["MyLib"]), name: "Counter" }) });
  const adapter = Object.freeze({ kind: "static-method", id: `MyLib.Counter.From(${inputType.name})`,
    declaringType: counter, targetName: "From", inputType, resultType: counter });
  const literal = Object.freeze({ syntaxKind: "IsNumericLiteral", text: "30" });
  const declaration = providerDeclaration();
  const binding = providerBinding();
  const member = providerMethod({ parameters: [targetParameter("count", counter)], declaringTypeId: binding.id });
  const source = callEvidence({ argumentExpressions: [literal] });
  const relation = signatureRelation({ declaration, binding, member, sourceParameters: [{
    sourceParameterIndex: 0, targetParameterIndex: 0, sourcePassingMode: "by-value", targetPassingMode: "by-value",
    sourceAcceptsOmission: false, targetAcceptsOmission: false, sourceRest: false, targetParamsArray: false,
    argumentAdapter: adapter }] });
  const receiver = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: binding.id };
  const direct = directProviderHost({
    relations: [relation],
    facts: [providerFact(source.signatureDeclaration, declaration)],
    calls: [[source.call, source.evidence]],
    signatureDeclarations: [[source.evidence.selectedSignature, source.signatureDeclaration]],
    nodeTypes: [[literal, read], [source.evidence.sourceReceiver.expression, receiver]],
    semanticTypes: [[source.evidence.sourceArguments[0].type, read], [source.evidence.sourceReceiver.type, receiver],
      [source.evidence.sourceResultType, member.returnType]],
  });
  const selected = selectCsharpProviderCall(direct.host, source.call, direct.sourceFile);
  assert.equal(selected.kind, "resolved", "the provider call is selected");
  return { ...direct, counter, literal, call: source.call, read, selected };
}

function sealedProviderCallConversions(fixture) {
  const { host, sourceFile, counter, call, literal, read, selected } = fixture;
  const none = Object.freeze({ get: () => undefined });
  const policy = { ...host, sourceFiles: [sourceFile],
    ast: { ...host.ast, parent: () => undefined, getSourceFile: () => sourceFile,
      forEachChild: (node, visit) => { if (node === sourceFile) visit(call); else if (node === call) visit(literal); } },
    navigation: { ...host.navigation, referenceFor: () => undefined },
    semanticsFor: () => host.semantics(sourceFile) };
  const evidence = { compileTimeMetadata: Object.freeze({ get: () => false }), storageTargetType: none, yield: none };
  const shapes = { resolveNode: () => undefined, resolveTarget: () => undefined, registerStructuralInterface: () => false };
  const analysis = analyzeCsharpConversions(policy, evidence, shapes);
  const prepared = analysis.prepare({
    operations: { nativeUnreachable: Object.freeze({ get: () => false }), borrowedSequence: none, selectedConstruction: none,
      unaryOperation: none, selectedCall: Object.freeze({ get: node => node === call ? { target: selected } : undefined }) },
    expectedTypes: { expectedType: Object.freeze({ get: node => node === literal ? [counter] : [] }),
      requiredExpectedType: Object.freeze({ get: () => [] }), callableTarget: none,
      exactIntegerConversion: Object.freeze({ get: () => false }) },
    valueReads: { valueRead: Object.freeze({ get: node => node === literal ? { source: read } : undefined }) },
  });
  analysis.close({ entries: Object.freeze([]) }, []);
  const conversions = analysis.seal();
  assert.equal(conversions.issues.length, 0, "conversion analysis seals without issues");
  return { analysis, conversions, prepared };
}
