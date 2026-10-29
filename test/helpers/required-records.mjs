import assert from "node:assert/strict";
import { assertCsharpCompilationSucceeded, compileCsharpSource, compileCsharpAnalysisTarget } from "./direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "./program-source-files.mjs";

export function compileCsharpRequiredRecordSource(sourceText, surface) {
  let request;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget(received, observer) {
    request = received;
    return compileCsharpAnalysisTarget(received, observer);
  } });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  assert.equal(request !== undefined && program !== undefined, true, `${surface}: the real compilation observed its sealed program`);
  const source = request.input.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  return { compiled, request, source, program, nodes };
}

// The record families the assembly derives from analysis inputs instead of passing through a published reader. The
// sealed records do not retain those inputs exactly, so the fixture rebuilds them from the published readers; the
// member-hiding entries are not retained at all and are rebuilt empty.
export const csharpDerivedRecordFamilies = Object.freeze(["compilation", "sourceName", "nameInventory", "nativeMemberHiding", "jsonObjectShape", "nativeUse", "nativeOrder"]);

// Every pass-through input of createCsharpProgramRecords is a group of record readers; the published records are one
// such group, so each pass-through input is the records themselves.
const passThroughInputs = Object.freeze(["constructors","propertyValueProjection","arrayLiterals","literalEmission","templateStrings","dictionaryLiterals","sourceArtifacts","safetyEmission","startup","sourceFileEmission","projectEmission","typeParameterEmission","typeEmission","nativeConstants","binaryEmission","expressionEmission","lambdaEmission","typedLocationEmission","promiseResults","nativeLayouts","unionEquality","closedTypeTests","typeofEmission","jsValueBoxing","unaryEmission","thisEmission","memberNames","receiverCallProperties","restSequences","jsCalls","callAdmission","propertyAdmission","optionalCallChains","elementAdmission","sourceReferences","memberReceivers","sourceCallEmission","targetArguments","argumentPassing","targetCallEmission","constructionEmission","captureMethods","indexedRecords","objectLiterals","objectMembers","objectMethods","bindingIdentities","sourceFiles","objectShapes","objectShapeEmission","structuralObjectEmission","sourceUnions","classEmission","methods","callableDeclarations","callableParameters","classFields","lexicalValues","structuralInterfaces","nativeDeclarations","declarationModifiers","statementExits","statementCompletions","resourceScopes","localBindings","generators","nativeValueCarriers","literalValues","bindingPatterns","sourceEvidence","flowReads","valueReads","operations","expectedTypes","declarations","storage","conversions","exactLiterals","classFactories","classInitialization","captureStorage","callableCreations","numericRepresentations","typeProjections","callableAdapters","attributeApplications","safetyApplications","sourceModuleConstructions","moduleInitialization"]);

export function csharpRecordInput(records) {
  const group = Object.freeze({ ...records });
  const inventory = records.nameInventory.get();
  return Object.freeze({
    ...Object.fromEntries(passThroughInputs.map(name => [name, group])),
    names: Object.freeze({ resolve: records.sourceName.get, reservedNames: inventory.reservedNames,
      typeParameterNames: inventory.typeParameterNames, generatedMethodTypeParameters: records.generatedMethodTypeParameters }),
    compilation: records.compilation.get(),
    nativeMemberNames: Object.freeze({ memberHiding: Object.freeze([]) }),
    objectShapeDemand: records.objectShapeArtifact,
    nativeParticipation: Object.freeze({ participation: records.nativeParticipation }),
    nativeDemand: Object.freeze({ nativeUse: Object.freeze({ get: records.nativeUse.get, order: records.nativeOrder.get }) }),
  });
}

export function csharpRecordsOmitting(records, family, subject, reads) {
  const reader = records[family];
  assert.equal(typeof reader?.get === "function", true, `${family}: an assembled record family`);
  return Object.freeze({ ...records, [family]: Object.freeze({ ...reader, get(node, ...context) {
    reads?.push(family);
    return node === subject ? undefined : reader.get(node, ...context);
  } }) });
}

export function csharpRequiredRecordFailure(error, family, subject, construct, producer) {
  assert.equal(error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT", true, `${family}: the analysis invariant code`);
  assert.equal(error.diagnostic?.source === "tsonic-csharp", true, `${family}: the C# target owns the failure`);
  assert.equal(error.diagnostic?.category === "error", true, `${family}: the failure is an error`);
  assert.equal(error.diagnostic?.sourceNode === subject, true, `${family}: the exact checked subject survives failure transport`);
  assert.equal(error.diagnostic?.message ===
    `Required C# semantic plan '${family}' was not published for '${construct}' by '${producer}'.`, true,
    `${family}: the message names the family, construct and producer`);
  return true;
}
