import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpExactLiteralRequestCollector } from "../../../dist/analysis/conversions/literal-requests.js";
import { applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { callEvidence, directProviderHost, providerBinding, providerDeclaration, providerFact, providerMethod,
  selectCsharpProviderCall, signatureRelation, targetParameter } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const primitives = ["bool", "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int",
  "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"];

function literals(entries) {
  const values = new Map(entries);
  return Object.freeze({ literalValue: Object.freeze({ get: node => values.get(node) }) });
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
    ["int32", "int16", { kind: "source-representation" }, planned],
    ["float64", "int64", { kind: "resolved", recipe: { kind: "integer", target: primitive("int64"), width: "int64", value: 30n } },
      { kind: "IntegerLiteralExpression", digits: "30", suffix: "L" }],
  ];
  for (const [readName, inputName, record, input] of cases) {
    const fixture = providerAdapterCall(primitive(readName), primitive(inputName));
    const mapping = fixture.selected.call.argumentMappings[0];
    assert.equal(mapping.conversion.kind === "provider-argument-adapter" && mapping.conversion.sourceToInput.proof === "literal" &&
      mapping.conversion.resultToTarget.kind === "identity", true, `${readName} to ${inputName}: policy selects the adapter with a literal input step`);
    const requests = sealedProviderCallConversions(fixture).conversions.exactLiteralRequests
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

test("exact literal requests are published only on the sealed conversion classifications, frozen", () => {
  const { analysis, conversions } = sealedProviderCallConversions(providerAdapterCall(primitive("int32"), primitive("int16")));
  assert.equal(Object.hasOwn(analysis.classifications, "exactLiteralRequests"), false, "open classifications publish no request list");
  assert.equal(Array.isArray(conversions.exactLiteralRequests) && Object.isFrozen(conversions.exactLiteralRequests), true,
    "the sealed request list is frozen");
});

function providerAdapterCall(read, inputType) {
  const counter = Object.freeze({ kind: "target-named", id: "MyLib.Counter",
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
  const receiver = { kind: "target-named", id: binding.id };
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
  const conversions = analysis.seal({
    operations: { nativeUnreachable: Object.freeze({ get: () => false }), borrowedSequence: none, selectedConstruction: none,
      unaryOperation: none, selectedCall: Object.freeze({ get: node => node === call ? { target: selected } : undefined }) },
    expectedTypes: { expectedType: Object.freeze({ get: node => node === literal ? [counter] : [] }),
      requiredExpectedType: Object.freeze({ get: () => [] }), callableTarget: none,
      exactIntegerConversion: Object.freeze({ get: () => false }) },
    valueReads: { valueRead: Object.freeze({ get: node => node === literal ? { source: read } : undefined }) },
  });
  assert.equal(conversions.issues.length, 0, "conversion analysis seals without issues");
  return { analysis, conversions };
}
