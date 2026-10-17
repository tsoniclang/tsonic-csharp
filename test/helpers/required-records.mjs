import assert from "node:assert/strict";
import { compileCsharpTarget } from "../../dist/backend/compile.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "./direct-csharp-session.mjs";

export function compileCsharpRequiredRecordSource(sourceText, surface) {
  let request;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget(received, observer) {
    request = received;
    return compileCsharpTarget(received, observer);
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
  program.sourceFiles.forEach(visit);
  return { compiled, request, source, program, nodes };
}

export function csharpRecordInput(records) {
  const group = Object.freeze({ ...records });
  return Object.freeze({
    objectShapeDemand: records.objectShapeArtifact,
    nativeValueCarriers: group,
    literalValues: group,
    nativeParticipation: Object.freeze({ participation: records.nativeParticipation }),
    nativeDemand: group,
    bindingPatterns: group,
    sourceEvidence: group,
    flowReads: group,
    valueReads: group,
    operations: group,
    expectedTypes: group,
    declarations: group,
    storage: group,
    conversions: group,
    exactLiterals: group,
    classFactories: group,
    classInitialization: group,
    captureStorage: group,
    callableCreations: group,
    numericRepresentations: group,
    typeProjections: group,
    callableAdapters: group,
    attributeApplications: group,
    safetyApplications: group,
    sourceModuleConstructions: group,
    moduleInitialization: group,
  });
}

export function csharpRecordsOmitting(records, family, subject, reads) {
  const reader = records[family];
  assert.equal(typeof reader?.get === "function", true, `${family}: an assembled record family`);
  return Object.freeze({ ...records, [family]: Object.freeze({ get(node, ...context) {
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
