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
  const operations = { nativeUnreachable: Object.freeze({ get: () => false }), borrowedSequence: none, binaryOperation: none, selectedConstruction: none,
      unaryOperation: none, selectedCall: Object.freeze({ get: node => node === call ? { target: selected } : undefined }) };
  const analysis = analyzeCsharpConversions(policy, evidence, shapes, operations);
  const prepared = analysis.prepare({
    expectedTypes: { expectedType: Object.freeze({ get: node => node === literal ? [counter] : [] }),
      requiredExpectedType: Object.freeze({ get: () => [] }), callableTarget: none,
      exactIntegerConversion: Object.freeze({ get: () => false }) },
    valueReads: { valueRead: Object.freeze({ get: node => node === literal ? { value: read, source: read } : undefined }) },
  });
  analysis.close({ entries: Object.freeze([]) }, []);
  const conversions = analysis.seal();
  assert.equal(conversions.issues.length, 0, "conversion analysis seals without issues");
  return { analysis, conversions, prepared };
}

export { primitive, primitives, literals, checkedPropertyKeys, providerAdapterCall, sealedProviderCallConversions };
