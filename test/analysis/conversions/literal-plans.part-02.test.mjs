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
    const selected = selectCsharpExactLiteralConversion(literal, primitive(type));
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
    Object.freeze({ expression: wide }),
    Object.freeze({ expression: wide, target: primitive("int64") }),
    Object.freeze({ expression: wide, target: csharpNullableTargetType(primitive("uint128")) }),
    Object.freeze({ expression: text, target: csharpStringTargetType() }),
    Object.freeze({ expression: other, target: primitive("int64") }),
  ], [wide, text, other, another]);
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
  // The analysed node domain (the third argument) is where the shared non-literal datum applies.
  assert.equal(Object.isFrozen(notLiteral) && exactLiteral.get(another, undefined) === notLiteral, true);
});

test("exact literal selections are materialized once per canonical key and published read-only", () => {
  const node = Object.freeze({});
  const value = Object.freeze({ form: "bigint", integer: 1n << 40n });
  const first = csharpNullableTargetType(primitive("int64"));
  const second = csharpNullableTargetType(primitive("int64"));
  const requests = [Object.freeze({ expression: node, target: first }), Object.freeze({ expression: node, target: second })];
  const index = analyzeCsharpExactLiteralSelections(literals([[node, value]]), requests, [node]);
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
  ], [node]);
  assert.deepEqual(index.exactLiteral.get(node, primitive("float32")),
    { kind: "rejected", reason: "Source numeric literal is outside the 'float32' range." });
  assert.deepEqual(index.exactLiteral.get(node, primitive("float64")), { kind: "source-representation" });
  assert.equal(index.exactLiteral.get(node, primitive("float32")) === index.exactLiteral.get(node, primitive("float32")), true,
    "duplicate requests read one materialized selection");
  const [decimal] = checkedSourceLiteralValues(["9007199254740993"]);
  const exact = analyzeCsharpExactLiteralSelections(literals([[node, decimal]]), [{ expression: node, target: primitive("decimal") }], [node]);
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

test("the literal collector closes once and validates later exact endpoints without adding requests", () => {
  const expression = {};
  const source = primitive("float64");
  const target = primitive("float32");
  const collector = createCsharpExactLiteralRequestCollector(literals([[expression,
    Object.freeze({ form: "numeric", number: 1.25 })]]));
  const literal = Object.freeze({ kind: "implicit", proof: "literal" });
  collector.requestConversion(expression, source, target, literal);
  const requests = collector.seal();
  assert.equal(requests === collector.requests && Object.isFrozen(requests), true, "one immutable request set is published");
  collector.requestConversion(expression, source, target, literal);
  assert.equal(requests.length, 1, "a later admitted endpoint is validation only");
  assert.throws(() => collector.requestConversion(expression, source, primitive("decimal"), literal),
    /exact endpoint before literal publication/u, "a different native endpoint cannot appear after publication");
  assert.equal(requests.length, 1, "a refused late endpoint leaves the exact request set unchanged");
  assert.throws(() => collector.seal(), /close exactly once/u, "the collector cannot be reopened or resealed");
  assert.throws(() => collector.requestReads(expression, [source], [target], { unaryOperation: { get: () => undefined } }),
    /cannot read another source use/u, "post-close source collection cannot mutate a frozen literal plan");
});

test("actual literal uses prepare their selected union inner endpoint before the one literal snapshot", () => {
  const expression = {};
  const sourceFile = {};
  const source = primitive("float64");
  const target = csharpRuntimeUnionTargetType([primitive("float32"), csharpStringTargetType()]);
  const [literal] = checkedSourceLiteralValues(["1.25"]);
  const literalValues = literals([[expression, literal]]);
  const none = Object.freeze({ get: () => undefined });
  const policy = { sourceFiles: [sourceFile], target: {}, literalValues,
    ast: { is: { IsCallExpression: () => false, IsIdentifier: () => false, IsVariableDeclaration: () => false,
      IsReturnStatement: () => false, IsArrayLiteralExpression: () => false },
      getSourceFile: () => undefined, forEachChild: (node, visit) => { if (node === sourceFile) visit(expression); } },
    navigation: { referenceFor: () => undefined }, projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };
  const analysis = analyzeCsharpConversions(policy, { compileTimeMetadata: { get: () => false } },
    { resolveNode: () => undefined, resolveTarget: () => undefined, registerStructuralInterface: () => false });
  const prepared = analysis.prepare({
    operations: { nativeUnreachable: { get: () => false }, borrowedSequence: none, binaryOperation: none, selectedCall: none,
      selectedConstruction: none, unaryOperation: none },
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
  const selected = sealed.expressionConversion.get(expression, source, target, "implicit");
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
