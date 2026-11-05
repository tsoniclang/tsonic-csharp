import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpExactLiteralRequestCollector } from "../../../dist/analysis/conversions/literal-requests.js";
import { readCsharpExpressionOperandStability, applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpExactLiteralConversion, selectCsharpExactPropertyKeyConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/index.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, checkCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
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

const valueRecipeCases = [
  { name: "minimum signed integer", type: "int32", value: "-2147483648", recipe: "integer" },
  { name: "half", type: "float16", value: "1.5", recipe: "float", precision: "float16" },
  { name: "single", type: "float32", value: "1.5", recipe: "float", precision: "float32" },
  { name: "double", type: "number", value: "1.5" },
  { name: "decimal", type: "decimal", value: "1.5", recipe: "float", precision: "decimal" },
  { name: "negative zero", type: "number", value: "-0", recipe: "signed-zero" },
  { name: "character", type: "char", value: '"x"', recipe: "char" },
  { name: "source string", type: "string", value: '"text"' },
  { name: "source boolean", type: "boolean", value: "true" },
];
for (const surface of ["native", "js"]) for (const destination of ["direct", "union", "nullable"]) {
  for (const example of valueRecipeCases) {
    test(`${surface} ${destination} literal endpoint retains its physical ${example.name} record`, () => {
      const otherArm = example.type === "boolean" ? "string" : "boolean";
      const type = destination === "union" ? `${example.type} | ${otherArm}`
        : destination === "nullable" ? `${example.type} | undefined` : example.type;
      const imported = ["int32", "float16", "float32", "decimal", "char"].includes(example.type)
        ? `import type { ${example.type} } from "@tsonic/core/types.js";` : "";
      const compiled = compileCsharpSource({ surface, sourceText: `${imported}
        export function run(): (${type})[] { return [${example.value}]; }` });
      assertCsharpCompilationSucceeded(compiled);
      const source = createTargetSourceProgram(compiled.source);
      const ast = source.ast;
      const file = compiled.source.getSourceFile("/project/index.ts");
      let aggregate;
      const visit = node => {
        if (ast.is.IsArrayLiteralExpression(node)) aggregate = node;
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(file);
      const element = aggregate === undefined ? undefined : ast.elements(aggregate)[0];
      assert.equal(element !== undefined, true, "the exact authored value occurrence is retained");
      if (destination === "union") {
        const published = source.effectiveTypes.get(aggregate);
        assert.equal(published?.kind !== "refused" && published?.type.kind === "array" &&
          published.type.element.kind === "union" && published.type.element.types.length === 2, true,
        "each union case retains two distinct declared Source arms");
      }
      const emission = compiled.result.program.records.nativeExpression.get(element);
      assert.equal(emission !== undefined && emission.physical !== undefined, true, "the native value has its sealed physical construction");
      const selected = compiled.result.program.records.exactLiteral.get(element, emission.physical.carrier);
      if (example.recipe !== undefined) {
        assert.equal(selected?.kind === "resolved" && selected.recipe.kind === example.recipe, true,
          "the record belongs to the actual physical construction, not its enclosing storage union");
        if (example.precision !== undefined) assert.equal(selected.recipe.precision, example.precision);
      } else assert.equal(selected?.kind === "source-representation", true,
        "ordinary source strings, booleans and float64 values do not invent an exact numeric recipe");
    });
  }
}

const physicalLiteralCases = [
  { name: "floating negative zero", type: "number", primitive: "float64", value: "-0", recipe: "signed-zero" },
  { name: "integral negative zero", type: "int32", primitive: "int32", value: "-0", recipe: "integer" },
  { name: "binary integer", type: "int32", primitive: "int32", value: "1 + 2" },
  { name: "parenthesized integer", type: "int32", primitive: "int32", value: "(1 + 2)" },
  { name: "half token", type: "float16", primitive: "float16", value: "1.5", recipe: "float" },
  { name: "single token", type: "float32", primitive: "float32", value: "1.5", recipe: "float" },
  { name: "decimal token", type: "decimal", primitive: "decimal", value: "1.5", recipe: "float" },
  ...["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "nativeInt", "nativeUint"]
    .map(type => ({ name: `${type} token`, type,
      primitive: type === "nativeInt" ? "native-int" : type === "nativeUint" ? "native-uint" : type,
      value: ["int64", "uint64", "int128", "uint128"].includes(type) ? "3n" : "3", recipe: "integer" })),
  { name: "character token", type: "char", primitive: "char", value: '"x"', recipe: "char" },
];
for (const surface of ["native", "js"]) for (const storage of ["direct", "nullable", "union", "nested union", "nullable union"]) {
  for (const example of physicalLiteralCases) {
    test(`${surface} ${storage} ${example.name} uses its admitted physical literal source`, () => {
      const type = storage === "direct" ? example.type : storage === "nullable" ? `${example.type} | undefined`
        : storage === "union" ? `${example.type} | boolean`
          : storage === "nested union" ? "Inner | string" : `(${example.type} | boolean) | undefined`;
      const imported = example.type === "number" ? "" : `import type { ${example.type} } from "@tsonic/core/types.js";`;
      const compiled = compileCsharpSource({ surface, sourceText: `${imported}
        type Inner = ${example.type} | boolean;
        export function run(): (${type})[] { return [${example.value}]; }` });
      assertCsharpCompilationSucceeded(compiled);
      const source = createTargetSourceProgram(compiled.source);
      const file = compiled.source.getSourceFile("/project/index.ts");
      let aggregate;
      const visit = node => {
        if (source.ast.is.IsArrayLiteralExpression(node)) aggregate = node;
        source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(file);
      const expression = aggregate === undefined ? undefined : source.ast.elements(aggregate)[0];
      assert.equal(expression !== undefined, true, "the construction is the actual checked literal or constant expression");
      const literal = analyzeSourceLiteralValues(source.ast, [file]).literalValue.get(expression);
      const records = compiled.result.program.records;
      const physicalSource = records.valueRead.get(expression)?.value;
      assert.equal(physicalSource?.kind === "source-primitive" && physicalSource.name === example.primitive, true,
        "the completed construction source is its native arm, never the enclosing union storage");
      const emission = records.nativeExpression.get(expression);
      assert.equal(emission?.physical !== undefined, true, "the actual physical endpoint was admitted before literal publication");
      const carrier = emission.physical.carrier;
      const expected = selectCsharpExactLiteralConversion(literal, physicalSource, carrier);
      const selected = records.exactLiteral.get(expression, carrier);
      assert.equal(expected.kind === (example.recipe === undefined ? "source-representation" : "resolved"), true,
        "the real native literal rule admits this source and endpoint without a value-specific workaround");
      assert.equal(selected?.kind === expected.kind, true, "the published record uses the one completed physical source");
      if (expected.kind === "resolved") {
        assert.equal(expected.recipe.kind === example.recipe && selected.recipe.kind === example.recipe, true);
        assert.equal(selected.recipe.kind !== "integer" || selected.recipe.value === expected.recipe.value, true);
        assert.equal(selected.recipe.kind !== "float" || selected.recipe.precision === expected.recipe.precision &&
          selected.recipe.negative === expected.recipe.negative && selected.recipe.token.significand === expected.recipe.token.significand, true);
        assert.equal(selected.recipe.kind !== "char" || selected.recipe.value === "x", true);
        if (example.name === "integral negative zero") assert.equal(selected.recipe.value === 0n, true,
          "the admitted integral arm has positive native zero");
      }
      assert.equal(Object.isFrozen(selected), true, "the exact endpoint is one immutable canonical publication");
    });
  }
}

for (const surface of ["native", "js"]) {
  test(`${surface} physical negative zero reaches every admitted storage without losing its native bits`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      type Inner = number | boolean;
      export function direct(): number { return -0; }
      export function nullable(): number | undefined { return -0; }
      export function union(): number | boolean { return -0; }
      export function nested(): Inner | string { return -0; }
      export function nullableUnion(): (number | boolean) | undefined { return -0; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = createTargetSourceProgram(compiled.source);
    const file = compiled.source.getSourceFile("/project/index.ts");
    const checks = ["direct", "nullable", "union", "nested", "nullableUnion"].map(name => {
      const declaration = source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === name);
      assert.equal(declaration !== undefined, true, `${name}: the real declared callable is retained`);
      const contract = compiled.result.program.records.returnContract.get(declaration);
      assert.equal(contract?.kind === "resolved", true, `${name}: the native ABI comes from the Host return`);
      const present = getCsharpNullableElementTargetType(contract.type);
      const arms = getCsharpRuntimeUnionArms(present ?? contract.type, compiled.result.program.typeDefinitions);
      const index = arms?.findIndex(arm => arm.kind === "source-primitive" && arm.name === "float64");
      assert.equal(arms === undefined || index !== undefined && index >= 0, true,
        `${name}: the ABI retains the actual double arm rather than assuming its position`);
      const value = present === undefined ? name : `${name}.Value`;
      const scalar = arms === undefined ? value : `${value}.As${index + 1}()`;
      const absent = present === undefined ? "" : `!${name}.HasValue || `;
      const wrongArm = arms === undefined ? "" : `!${value}.Is${index + 1}() || `;
      return `var ${name} = Tsonic.Generated.Index.${name}();
        if (${absent}${wrongArm}System.BitConverter.DoubleToInt64Bits(${scalar}) != long.MinValue)
          throw new System.Exception("${name} physical negative-zero bits");`;
    });
    executeCsharpConstruction(compiled, `physical-literal-source-zero-${surface}`, false, false, [], checks.join("\n"));
  });
}

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [type, value] of Array.from([["int8", "128"], ["int8", "(128)"], ["float16", "65520"]]).slice(0, 3)) {
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
    const selected = selectCsharpExactLiteralConversion(literal, primitive(type), primitive(type));
    assert.equal(selected.kind === "rejected" && diagnostics[0].code === "CSHARP_UNSUPPORTED_AST" &&
      diagnostics[0].message === selected.reason, true, "the completed native literal owner supplies the exact retained reason");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "refusal precedes publication and native planning");
  });
}
}

test("exact literal selections exist only at requested keys and equal the native rule", () => {
  const wide = Object.freeze({});
  const text = Object.freeze({});
  const other = Object.freeze({});
  const another = Object.freeze({});
  const wideValue = Object.freeze({ form: "bigint", integer: 3n });
  const textValue = Object.freeze({ form: "string", text: "x" });
  const index = analyzeCsharpExactLiteralSelections(literals([[wide, wideValue], [text, textValue]]), [
    Object.freeze({ expression: wide, source: primitive("int64") }),
    Object.freeze({ expression: wide, source: primitive("int64"), target: primitive("int64") }),
    Object.freeze({ expression: wide, source: primitive("int64"), target: csharpNullableTargetType(primitive("uint128")) }),
    Object.freeze({ expression: text, source: csharpStringTargetType(), target: csharpStringTargetType() }),
    Object.freeze({ expression: other, source: undefined, target: primitive("int64") }),
  ], [wide, text, other, another]);
  const exactLiteral = index.exactLiteral;
  assert.deepEqual(exactLiteral.get(wide, undefined), { kind: "not-applicable" }, "the explicit intrinsic request");
  for (const target of [primitive("int64"), csharpNullableTargetType(primitive("uint128"))]) {
    assert.deepEqual(exactLiteral.get(wide, target), selectCsharpExactLiteralConversion(wideValue, primitive("int64"), target), targetTypeRefKey(target));
  }
  assert.deepEqual(exactLiteral.get(text, csharpStringTargetType()), { kind: "source-representation" });
  assert.equal(exactLiteral.get(text, undefined), undefined, "no intrinsic request, no record");
  for (const name of primitives) {
    assert.equal(exactLiteral.get(text, primitive(name)), undefined, `${name}: no unrequested native table`);
  }
  assert.equal(exactLiteral.get(wide, primitive("int32")), undefined, "an unrequested target stays unknown");
  const notLiteral = exactLiteral.get(other, primitive("int64"));
  assert.deepEqual(notLiteral, { kind: "not-applicable" }, "a node without a literal datum is never a literal conversion");
  // The analysed node domain (the third argument) is where the shared non-literal datum applies.
  assert.equal(Object.isFrozen(notLiteral) && exactLiteral.get(another, undefined) === notLiteral, true);
});

test("exact literal selections are materialized once per canonical key and published read-only", () => {
  const node = Object.freeze({});
  const value = Object.freeze({ form: "bigint", integer: 1n << 40n });
  const first = csharpNullableTargetType(primitive("int64"));
  const second = csharpNullableTargetType(primitive("int64"));
  const requests = [Object.freeze({ expression: node, source: undefined, target: first }), Object.freeze({ expression: node, source: undefined, target: second })];
  const index = analyzeCsharpExactLiteralSelections(literals([[node, value]]), requests, [node]);
  const selected = index.exactLiteral.get(node, first);
  assert.equal(selected.kind, "resolved");
  assert.equal(first !== second && index.exactLiteral.get(node, second) === selected, true, "one selection per canonical key");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.recipe), true, "frozen selection data");
  assert.equal(Object.isFrozen(index) && Object.isFrozen(index.exactLiteral), true, "frozen index");
  assert.deepEqual(Object.keys(index), ["exactLiteral"]);
  assert.deepEqual(Object.keys(index.exactLiteral), ["get"], "get-only family");
  requests.push(Object.freeze({ expression: node, source: undefined, target: primitive("uint64") }));
  assert.equal(index.exactLiteral.get(node, primitive("uint64")), undefined, "requests after materialization are not read");
});

test("exact native token plans are frozen once without treating a refused candidate as an actual use", () => {
  const [value] = checkedSourceLiteralValues(["1e39"]);
  const node = Object.freeze({});
  const index = analyzeCsharpExactLiteralSelections(literals([[node, value]]), [
    { expression: node, source: undefined, target: primitive("float32") }, { expression: node, source: undefined, target: primitive("float64") },
    { expression: node, source: undefined, target: primitive("float32") },
  ], [node]);
  assert.deepEqual(index.exactLiteral.get(node, primitive("float32")),
    { kind: "rejected", reason: "Source numeric literal is outside the 'float32' range." });
  assert.deepEqual(index.exactLiteral.get(node, primitive("float64")), { kind: "source-representation" });
  assert.equal(index.exactLiteral.get(node, primitive("float32")) === index.exactLiteral.get(node, primitive("float32")), true,
    "duplicate requests read one materialized selection");
  const [decimal] = checkedSourceLiteralValues(["9007199254740993"]);
  const exact = analyzeCsharpExactLiteralSelections(literals([[node, decimal]]), [{ expression: node, source: undefined, target: primitive("decimal") }], [node]);
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
  collector.requestReads(other, int32, [int32], [int64], operations);
  collector.requestConversion(other, int32, int64, literal, int32);
  assert.equal(collector.requests.length + unaryReads.length, 0, "a node without a literal datum requests and reads nothing");
  collector.requestReads(node, int32, [int32], [float32], operations);
  collector.requestConversion(node, int32, int64, literal, int32);
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({ kind: "js-value-box" }), int32);
  collector.requestConversion(node, csharpNullableTargetType(int32), csharpNullableTargetType(float32), Object.freeze({
    kind: "nullable-map", sourceElement: int32, targetElement: float32, conversion: literal }), int32);
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({
    kind: "implicit", proof: "runtime-union-arm", armIndex: 0, armType: int64, sourceToArm: literal }), int32);
  collector.requestConversion(node, int32, csharpStringTargetType(), Object.freeze({
    kind: "provider-argument-adapter", adapter: Object.freeze({ inputType: float32, resultType: int64 }),
    sourceToInput: literal, resultToTarget: Object.freeze({ kind: "js-value-box" }) }), int32);
  collector.requestConversion(node, int32, int64, Object.freeze({ kind: "implicit", proof: "numeric" }), int32);
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
  const pending = [...csharpProgramSourceFiles(program)];
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
  assert.deepEqual(records.exactLiteral.get(csharpProgramSourceFiles(program)[0], primitive("int64")), { kind: "not-applicable" });
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
    const exactLiteral = analyzeCsharpExactLiteralSelections(fixture.host.literalValues, requests, [fixture.literal]).exactLiteral;
    assert.deepEqual(exactLiteral.get(fixture.literal, primitive(inputName)), record, `${inputName}: the record at the adapter input`);
    const diagnostics = [];
    const prelude = [];
    const rendered = applyCsharpConversionSelection(fixture.literal, fixture.sourceFile, {
      program: { records: { exactLiteral } }, scope: { typeParameterNames: undefined },
    }, diagnostics, mapping.sourceType, mapping.targetType, mapping.conversion, planned, prelude, readCsharpExpressionOperandStability(fixture.literal, {
      program: { records: { exactLiteral } }, scope: { typeParameterNames: undefined },
    }, mapping.sourceType, mapping.targetType, "implicit", mapping.conversion));
    assert.deepEqual(rendered, { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "MyLib" }, name: "Counter" }, name: "From" },
    arguments: [{ kind: "Argument", expression: input }] }, `${inputName}: the planner renders the adapter call`);
    assert.equal(diagnostics.length, 0, `${inputName}: no planner diagnostics`);
    assert.equal(prelude.length, 0, `${inputName}: the exact provider literal needs no statement prelude`);
  }
});

test("exact literal requests are private frozen preparation data, not sealed conversion readers", () => {
  const { analysis, conversions, prepared } = sealedProviderCallConversions(providerAdapterCall(primitive("int32"), primitive("int16")));
  assert.equal(Object.hasOwn(analysis.classifications, "exactLiteralRequests"), false, "open classifications publish no request list");
  assert.equal(Array.isArray(prepared.exactLiteralRequests) && Object.isFrozen(prepared.exactLiteralRequests), true,
    "the private completed request list is frozen");
  assert.equal(Object.hasOwn(conversions, "exactLiteralRequests"), false, "the final conversion port carries no preparation state");
});

test("the literal collector closes once and validates later exact endpoints without adding requests", () => {
  const expression = {};
  const source = primitive("float64");
  const target = primitive("float32");
  const collector = createCsharpExactLiteralRequestCollector(literals([[expression,
    Object.freeze({ form: "numeric", number: 1.25 })]]));
  const literal = Object.freeze({ kind: "implicit", proof: "literal" });
  collector.requestConversion(expression, source, target, literal, source);
  const requests = collector.seal();
  assert.equal(requests === collector.requests && Object.isFrozen(requests), true, "one immutable request set is published");
  collector.requestConversion(expression, source, target, literal, source);
  assert.equal(requests.length, 1, "a later admitted endpoint is validation only");
  assert.throws(() => collector.requestConversion(expression, source, primitive("decimal"), literal, source),
    /exact endpoint before literal publication/u, "a different native endpoint cannot appear after publication");
  assert.equal(requests.length, 1, "a refused late endpoint leaves the exact request set unchanged");
  assert.throws(() => collector.seal(), /close exactly once/u, "the collector cannot be reopened or resealed");
  assert.throws(() => collector.requestReads(expression, source, [source], [target], { unaryOperation: { get: () => undefined } }),
    /cannot read another source use/u, "post-close source collection cannot mutate a frozen literal plan");
});

for (const { early, completed } of [{ early: false, completed: true }, { early: true, completed: true }, { early: true, completed: false }]) {
  test(`literal preparation ${early ? "retains an early classification" : "classifies after value reads"} and ${completed ? "requires its physical source" : "rejects missing physical reads"}`, () => {
    const checked = checkCsharpSource({ surface: "native", sourceText: "export const value = 1.25;" });
    assertCsharpCheckingSucceeded(checked);
    const source = createTargetSourceProgram(checked.source);
    const file = checked.source.getSourceFile("/project/index.ts");
    let expression;
    const visit = node => {
      const initializer = source.ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined) expression = initializer;
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    assert.equal(expression !== undefined, true, "the original checked initializer is the classification subject");
    const logical = primitive("float64");
    const physical = primitive("float16");
    const target = primitive("float32");
    const none = Object.freeze({ get: () => undefined });
    const policy = { sourceFiles: [file], target: {}, ast: source.ast, effectiveTypes: source.effectiveTypes,
      literalValues: analyzeSourceLiteralValues(source.ast, [file]), navigation: { referenceFor: () => undefined },
      projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };
    const operations = { yield: none, nativeUnreachable: { get: () => false }, borrowedSequence: none,
      binaryOperation: none, selectedCall: none, selectedConstruction: none, selectedElement: none, unaryOperation: none };
    const analysis = analyzeCsharpConversions(policy, { compileTimeMetadata: { get: () => false },
      nodeTargetType: { get: node => node === expression ? logical : undefined }, storageTargetType: none },
    { resolveNode: () => undefined, resolveTarget: () => undefined, registerStructuralInterface: () => false }, operations);
    const before = early ? analysis.classifications.expressionConversion.get(expression, logical, target, "implicit") : undefined;
    assert.equal(!early || before?.selection.kind === "implicit" && before.selection.proof === "literal", true,
      "an early conversion is classified without publishing or guessing a physical literal source");
    const prepare = () => analysis.prepare({ expectedTypes: { callableTarget: none,
      expectedType: { get: node => node === expression ? [target] : [] }, exactIntegerConversion: { get: () => false } },
    valueReads: { valueRead: { get: node => node === expression ? { source: logical, ...(completed ? { value: physical } : {}) } : undefined } } });
    if (!completed) {
      assert.throws(prepare, error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" &&
        error.message.includes("Literal conversion requests require completed value reads."),
      "a logical source alone cannot replace the missing completed construction");
      return;
    }
    const prepared = prepare();
    const requests = prepared.exactLiteralRequests.filter(request => request.expression === expression);
    assert.equal(requests.length > 0 && requests.every(request => request.source === physical), true,
      "both early and new classifications publish only after completion, with the one physical source");
    const current = prepared.expressionConversion.get(expression, logical, target, "implicit");
    assert.equal(!early || current === before, true, "preparation consumes the already classified conversion, not a second decision");
    assert.equal(prepare() === prepared && Object.isFrozen(prepared.exactLiteralRequests), true,
      "literal preparation closes once and cannot register a later source");
  });
}

test("actual literal uses prepare their selected union inner endpoint before the one literal snapshot", () => {
  const checked = checkCsharpSource({ surface: "native", sourceText: "export const value = 1.25;" });
  assertCsharpCheckingSucceeded(checked);
  const syntax = createTargetSourceProgram(checked.source);
  const sourceFile = checked.source.getSourceFile("/project/index.ts");
  assert.equal(sourceFile !== undefined, true, "the exact checked literal file is retained");
  let declaration;
  const visit = node => {
    if (syntax.ast.is.IsVariableDeclaration(node) && syntax.ast.text(syntax.ast.name(node)) === "value") declaration = node;
    syntax.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(sourceFile);
  const expression = syntax.ast.as.AsVariableDeclaration(declaration)?.Initializer;
  assert.equal(expression !== undefined && syntax.ast.parent(expression) === declaration, true,
    "literal conversion uses the real checked initializer and its exact parent");
  const source = primitive("float64");
  const target = csharpRuntimeUnionTargetType([primitive("float32"), csharpStringTargetType()]);
  const literalValues = analyzeSourceLiteralValues(syntax.ast, [sourceFile]);
  assert.equal(literalValues.literalValue.get(expression)?.number === 1.25, true,
    "the original exact checked literal is not reconstructed for the Native request");
  const none = Object.freeze({ get: () => undefined });
  const policy = { sourceFiles: [sourceFile], target: {}, literalValues,
    ast: syntax.ast, effectiveTypes: syntax.effectiveTypes,
    navigation: { referenceFor: () => undefined }, projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };
  const operations = { yield: none, nativeUnreachable: { get: () => false }, borrowedSequence: none, binaryOperation: none, selectedCall: none,
      selectedConstruction: none, selectedElement: none, unaryOperation: none };
  const analysis = analyzeCsharpConversions(policy, { compileTimeMetadata: { get: () => false },
    nodeTargetType: { get: node => node === expression ? source : undefined },
    storageTargetType: { get: node => node === declaration ? source : undefined } },
    { resolveNode: () => undefined, resolveTarget: () => undefined, registerStructuralInterface: () => false }, operations);
  const prepared = analysis.prepare({
    expectedTypes: { callableTarget: none, expectedType: { get: node => node === expression ? [target] : [] },
      exactIntegerConversion: { get: () => false } },
    valueReads: { valueRead: { get: node => node === expression ? { value: source, source } : undefined } },
  });
  const requests = prepared.exactLiteralRequests;
  const exact = analyzeCsharpExactLiteralSelections(literalValues, requests, [expression]);
  const inner = exact.exactLiteral.get(expression, primitive("float32"));
  assert.equal(inner?.kind === "resolved" && inner.recipe.kind === "float" && inner.recipe.precision === "float32" &&
    inner.recipe.token.significand === "1.25", true, "the selected inner target exists before NativeDemand consumes exact literals");
  const site = csharpNativeUseSite(expression, { kind: "return" });
  const use = Object.freeze({ kind: "converted", expression, carrier: source, target, mode: "implicit",
    input: Object.freeze({ kind: "value", type: source }), completion: Object.freeze({ kind: "value", type: target }),
    children: Object.freeze([]), evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([]) }) });
  const count = requests.length;
  analysis.close({ entries: [{ site, use }] }, []);
  const sealed = analysis.seal();
  const selected = sealed.expressionConversion.get(expression, source, target, "implicit")?.selection;
  assert.equal(selected?.kind === "implicit" && selected.proof === "runtime-union-arm" &&
    selected.sourceToArm.proof === "literal", true, "the actual consumed union conversion reuses the prepared correspondence");
  assert.equal(requests.length === count && Object.isFrozen(requests) && sealed.issues.length === 0, true,
    "closing the actual uses cannot add endpoints, rebuild literals or hide a conversion issue");
  assert.equal(exact.exactLiteral.get(expression, primitive("decimal")) === undefined, true,
    "an unrelated representable native literal target remains unrequested");
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} actual literal union return renders its prepared inner native endpoint`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { float32 } from "@tsonic/core/types.js";
    export function literalUnion(): float32 | string { return 1.25; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let declaration;
  let expression;
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "literalUnion") declaration = node;
    if (ast.is.IsReturnStatement(node)) expression = ast.as.AsReturnStatement(node).Expression;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(declaration !== undefined && expression !== undefined, true, "the actual checked return and literal are present");
  const inner = program.records.exactLiteral.get(expression, primitive("float32"));
  assert.equal(inner?.kind === "resolved" && inner.recipe.kind === "float" && inner.recipe.precision === "float32" &&
    inner.recipe.token.significand === "1.25", true, "the selected union payload owns the exact prepared float32 recipe");
  const contract = program.records.returnContract.get(declaration);
  const arms = contract?.kind === "resolved" ? getCsharpRuntimeUnionArms(contract.type, program.typeDefinitions) : undefined;
  const index = arms?.findIndex(arm => arm.kind === "source-primitive" && arm.name === "float32");
  assert.equal(index !== undefined && index >= 0 && arms.length === 2, true, "the native union retains its actual float32 and string arms");
  executeCsharpConstruction(compiled, `literal-union-inner-${surface}`, false, false, [], `
    var value = Tsonic.Generated.Index.literalUnion();
    if (!value.Is${index + 1}() || value.As${index + 1}() != 1.25F)
      throw new System.Exception("selected native literal union payload");
  `);
});
}
