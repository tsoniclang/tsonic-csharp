import assert from "node:assert/strict";
import { compileCsharpSource, compileCsharpAnalysisTarget } from "./direct-csharp-session.mjs";
import { csharpAsyncGeneratorTargetType, csharpGeneratorTargetType } from "../../dist/target-model/types/carriers/generators.js";

// The published generator fact of a declaration carries its protocol; its declared carrier is the protocol's generator type.
export function publishedGeneratorCarrier(records, node) {
  const fact = records.generator.get(node);
  if (fact === undefined) return undefined;
  const protocol = { yieldType: fact.yieldType, returnType: fact.returnType, nextType: fact.nextType };
  return fact.kind === "async" ? csharpAsyncGeneratorTargetType(protocol) : csharpGeneratorTargetType(protocol);
}

export function publishedGenericProjections(records, nodes) {
  return Object.freeze({ genericProjection: records.genericProjection,
    outerGenericProjection: records.outerGenericProjection, entries: Object.freeze(nodes.flatMap(declaration => {
      const parameters = records.genericProjection.get(declaration);
      const outerParameters = records.outerGenericProjection.get(declaration);
      return parameters.length === 0 && outerParameters.length === 0 ? [] : [{ declaration, parameters, outerParameters }];
    })) });
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
  assert.equal(program !== undefined && program.analysis !== undefined, true,
    "the real compilation publishes its original complete analysis, not a reconstructed fixture context");
  const source = program.source;
  const original = program.analysis;
  const { policy, sourceEvidence, operations, objectShapes, callables, valueReadStages, declarations, typeProjections, expectedTypes } = original;
  assert.equal(policy.facts === source.facts && policy.representation === program.representation, true,
    "the actual Native policy retains the identical Source facts and single representation view");
  assert.equal(sourceEvidence !== undefined && operations !== undefined && objectShapes !== undefined &&
    callables !== undefined && valueReadStages !== undefined && declarations !== undefined &&
    typeProjections !== undefined && expectedTypes !== undefined, true,
  "all expected-use inputs are the original production references");
  const ast = source.ast;
  const nodes = [];
  const pending = [...policy.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const input = Object.freeze({ policy, evidence: sourceEvidence, operations, objectShapes, callables,
    valueReadStages, declarations, typeProjections });
  return { analysis: expectedTypes, input, program, source, nodes };
}
