import assert from "node:assert/strict";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpExpectedTypes } from "../../dist/analysis/expected-types/analyze.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { compileCsharpSource, compileCsharpAnalysisTarget } from "./direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "./program-source-files.mjs";
import { csharpAsyncGeneratorTargetType, csharpGeneratorTargetType } from "../../dist/target-model/types/carriers/generators.js";

// The published generator fact of a declaration carries its protocol; its declared carrier is the protocol's generator type.
export function publishedGeneratorCarrier(records, node) {
  const fact = records.generator.get(node);
  if (fact === undefined) return undefined;
  const protocol = { yieldType: fact.yieldType, returnType: fact.returnType, nextType: fact.nextType };
  return fact.kind === "async" ? csharpAsyncGeneratorTargetType(protocol) : csharpGeneratorTargetType(protocol);
}

export function compileCsharpNativeUseSource(options) {
  let nativeStage;
  const compiled = compileCsharpSource({ ...options, compileTarget(request, observer) {
    const result = compileCsharpAnalysisTarget(request, observer);
    nativeStage = { source: request.input.source, diagnostics: result.diagnostics };
    return result;
  } });
  if (compiled.sourceDiagnosticsText === "") assert.equal(nativeStage !== undefined, true,
    "checked native-use controls reach the actual target compiler once");
  if (nativeStage !== undefined) assert.equal(compiled.targetDiagnostics.length === nativeStage.diagnostics.length &&
    compiled.targetDiagnostics.every((issue, index) => {
      const original = nativeStage.diagnostics[index];
      return issue.code === original.code && issue.category === original.category && issue.message === original.message &&
        issue.source === original.source && issue.evidence === original.evidence;
    }), true, "the public diagnostic projection retains every native code, category, message, owner and evidence");
  return { ...compiled, nativeStage };
}

export function createExpectedNativeUseOwner(compiled) {
  const program = compiled.result.program;
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const pending = [...csharpProgramSourceFiles(program)];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const contracts = nodes.flatMap(node => {
    const declared = records.returnContract.get(node);
    const returnType = publishedGeneratorCarrier(records, node) ?? (declared?.kind === "resolved" ? declared.type : undefined);
    return returnType === undefined ? [] : [{ sourceDeclaration: node, returnType }];
  });
  const policy = { ast, sourceFiles: csharpProgramSourceFiles(program), navigation: source.navigation,
    target: compiled.target, providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    objectShapes: program.objectShapes, projectTypes: program.projectTypes,
    literalValues: analyzeSourceLiteralValues(ast, csharpProgramSourceFiles(program)),
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode,
    typeDefinitions: program.typeDefinitions };
  const input = { policy, evidence: records, operations: records, objectShapes: program.objectShapes,
    callables: { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    valueReadStages: { get: node => {
      const read = records.valueRead.get(node);
      return read === undefined ? undefined : {
        literalTarget: read.selectedOperation ?? read.source,
        operationValue: read.selectedOperation ?? read.source,
      };
    } }, declarations: records };
  const analysis = analyzeCsharpExpectedTypes(policy, records, records, input.objectShapes,
    input.callables, input.valueReadStages, records);
  return { analysis, input, program, source, nodes };
}
