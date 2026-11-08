import assert from "node:assert/strict";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpNativeLiteralQueries } from "../../../dist/analysis/source-evidence/native-literals.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { analyzeCsharpSource, checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { callEvidence, providerCallSource, directProviderHost, providerBinding, providerDeclaration, providerFact, providerMethod,
  selectCsharpProviderCall, signatureRelation, targetParameter } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

const primitive = name => csharpSourcePrimitiveTargetType(name);

const primitives = ["bool", "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int",
  "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"];

function represented(result, label) {
  assert.equal(result.kind === "represented", true, `${label}: ${result.message ?? result.refusal?.message ?? result.kind}`);
  return result.value;
}

function resolved(result, label) {
  assert.equal(result.kind === "resolved", true, `${label}: ${result.message ?? result.kind}`);
  return result.value;
}

function literalFixture(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  return { compiled, source, nodes, literals: createCsharpNativeLiteralQueries(source) };
}

function literalProgram(sourceText, options = {}) {
  return literalFixture(checkCsharpSource({ ...options, sourceText }));
}

function analyzedLiteralProgram(sourceText, options = {}) {
  return literalFixture(analyzeCsharpSource({ ...options, sourceText }));
}

function literalExpressions(expressions) {
  const fixture = literalProgram(expressions.map((text, index) => `export const value${index} = (${text});`).join("\n"));
  const declarations = fixture.nodes.filter(node => fixture.source.ast.is.IsVariableDeclaration(node));
  const originals = declarations.map(declaration => fixture.source.ast.as.AsVariableDeclaration(declaration).Initializer);
  assert.equal(originals.length === expressions.length && originals.every(node => node !== undefined), true,
    "each original fixture expression has one genuine authored initializer");
  return { ...fixture, expressions: originals };
}

function nativeLiteralIndex(literals, requests, nodes) {
  return represented(analyzeCsharpExactLiteralSelections(literals, requests, nodes), "the actual Native literal owner completes");
}

function literalAnalysis(fixture) {
  assert.equal(fixture.compiled.analysis.kind === "resolved", true,
    fixture.compiled.analysis.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  return fixture.compiled.analysis.value.analysis;
}

function checkedPropertyKeys() {
  const fixture = literalProgram(`
    import type { decimal } from "@tsonic/core/types.js";
    enum NumericKey { Wide = 9007199254740993 }
    const selected = "fixed" as const;
    export const keys = { plain: "a", [selected]: "b", 1.0: "e" };
    export const wideKeys: Record<decimal, string> = { 9007199254740993: "c" };
    export const enumKeys: Record<decimal, string> = { [NumericKey.Wide]: "d" };
  `, { surface: "js" });
  const { source, nodes } = fixture;
  const object = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "keys");
  const expression = source.ast.as.AsVariableDeclaration(object).Initializer;
  const ordinary = source.ast.properties(expression).map(property => source.ast.name(property));
  const wideObject = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "wideKeys");
  const wideExpression = source.ast.as.AsVariableDeclaration(wideObject).Initializer;
  const enumObject = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "enumKeys");
  const enumExpression = source.ast.as.AsVariableDeclaration(enumObject).Initializer;
  const names = [ordinary[0], ordinary[1], source.ast.name(source.ast.properties(wideExpression)[0]),
    source.ast.name(source.ast.properties(enumExpression)[0]), ordinary[2]];
  const memberKey = (value, property) => {
    const evidence = resolved(source.facts.values.type(value), "the original object has Source evidence");
    const definition = resolved(source.facts.descriptors.definition(evidence), "the same-view object definition is produced");
    assert.equal(definition.type.kind === "shape", true, "the original object publishes its structural member inventory");
    const member = definition.type.members.find(member => member.origin.kind === "declared" && member.origin.declaration === property);
    assert.equal(member !== undefined, true, "the key belongs to this exact original property declaration");
    return member.key;
  };
  const properties = source.ast.properties(expression);
  const selections = [memberKey(expression, properties[0]), memberKey(expression, properties[1]),
    memberKey(wideExpression, source.ast.properties(wideExpression)[0]),
    memberKey(enumExpression, source.ast.properties(enumExpression)[0]), memberKey(expression, properties[2])];
  const enumDeclaration = nodes.find(node => source.ast.is.IsEnumMember(node));
  assert.equal(enumDeclaration !== undefined, true, "the original enum key member is retained");
  const enumMember = resolved(source.facts.enums.member(enumDeclaration), "the canonical enum member is produced");
  return { ...fixture, names, selections, enumMember };
}

function providerAdapterCall(read, inputType) {
  const counter = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "MyLib.Counter",
    csharpRender: Object.freeze({ kind: "named", namespace: Object.freeze(["MyLib"]), name: "Counter" }) });
  const adapter = Object.freeze({ kind: "static-method", id: `MyLib.Counter.From(${inputType.name})`,
    declaringType: counter, targetName: "From", inputType, resultType: counter });
  const declaration = providerDeclaration();
  const binding = providerBinding();
  const member = providerMethod({ parameters: [targetParameter("count", counter)], declaringTypeId: binding.id });
  const source = callEvidence(providerCallSource({
    sourceArgumentTargets: [read],
    argumentExpressions: [{ syntaxKind: "IsNumericLiteral", text: "30" }],
  }, binding, member));
  const literal = source.evidence.sourceArguments[0].expression;
  const relation = signatureRelation({ declaration, binding, member, sourceParameters: [{
    sourceParameterIndex: 0, targetParameterIndex: 0, sourcePassingMode: "by-value", targetPassingMode: "by-value",
    sourceAcceptsOmission: false, targetAcceptsOmission: false, sourceRest: false, targetParamsArray: false,
    argumentAdapter: adapter }] });
  const receiver = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: binding.id };
  const direct = directProviderHost({
    sourceProgram: source.program,
    relations: [relation],
    facts: [providerFact(source.signatureDeclaration, declaration)],
    calls: [[source.call, source.evidence]],
    signatureDeclarations: [[source.evidence.selectedSignature, source.signatureDeclaration]],
    nodeTypes: [[literal, read], [source.evidence.sourceReceiver.expression, receiver], [source.call, member.returnType]],
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
    ast: host.ast,
    navigation: host.navigation,
    semanticsFor: host.semanticsFor };
  const evidence = { nodeTargetType: Object.freeze({ get: node => node === literal ? read : undefined }), compileTimeMetadata: Object.freeze({ get: () => false }), storageTargetType: none, yield: none };
  const shapes = { resolveNode: () => undefined, resolveTarget: () => undefined, registerStructuralInterface: () => false };
  const operations = { nativeUnreachable: Object.freeze({ get: () => false }), borrowedSequence: none, binaryOperation: none, selectedConstruction: none,
      unaryOperation: none, selectedElement: none, selectedCall: Object.freeze({ get: node => node === call ? { target: selected } : undefined }) };
  const analysis = analyzeCsharpConversions(policy, evidence, shapes, operations);
  const prepared = analysis.prepare({
    expectedTypes: { expectedType: Object.freeze({ get: node => node === literal ? [counter] : [] }),
      requiredExpectedType: Object.freeze({ get: () => [] }), callableTarget: none,
      exactIntegerConversion: Object.freeze({ get: () => false }) },
    valueReads: { valueRead: Object.freeze({ get: node => node === literal ? { value: read, source: read } : undefined }) },
  });
  analysis.close({ entries: Object.freeze([]) }, [], undefined, undefined,
    { flowReadProjection: { get: () => undefined }, issues: [] });
  const conversions = analysis.seal();
  assert.equal(conversions.issues.length, 0, "conversion analysis seals without issues");
  return { analysis, conversions, prepared };
}

export { primitive, primitives, represented, resolved, literalProgram, analyzedLiteralProgram, literalExpressions, literalAnalysis, nativeLiteralIndex,
  checkedPropertyKeys, providerAdapterCall, sealedProviderCallConversions };
