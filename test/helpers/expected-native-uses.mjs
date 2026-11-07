import assert from "node:assert/strict";
import { analyzeCsharpExpectedTypes } from "../../dist/analysis/expected-types/analyze.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { compileCsharpSource, compileCsharpAnalysisTarget } from "./direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "./program-source-files.mjs";
import { csharpAsyncGeneratorTargetType, csharpGeneratorTargetType } from "../../dist/target-model/types/carriers/generators.js";
import { createCsharpRepresentationServices, csharpRepresentationContext, representSourceType } from "../../dist/representation/index.js";

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
  return { ...compiled, nativeStage, targetSource: nativeStage?.source };
}

export function createExpectedNativeUseOwner(compiled) {
  const program = compiled.result.program;
  const source = program.source;
  assert.equal(source.facts !== undefined, true, "the original compiled Host publication is retained by the Native owner");
  const ast = source.syntax;
  const records = program.records;
  const nodes = [];
  const pending = [...csharpProgramSourceFiles(program)];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const contracts = nodes.flatMap(node => {
    const contract = records.callableDeclaration.get(node)?.contract;
    return contract === undefined ? [] : [contract];
  });
  const byDeclaration = new Map(contracts.map(contract => [contract.sourceDeclaration, contract]));
  const typeProjections = publishedGenericProjections(records, nodes);
  const evidence = Object.freeze({ ...records,
    generator: Object.freeze({ get: node => source.facts.selections.generator(node) }),
    generatorTargetType: Object.freeze({ get: node => publishedGeneratorCarrier(records, node) }),
    yieldTargetType: Object.freeze({ get: node => {
      const operand = ast.is.IsYieldExpression(node) ? ast.as.AsYieldExpression(node)?.Expression : undefined;
      return operand === undefined ? undefined : records.valueRead.get(operand)?.value;
    } }),
  });
  // The real C# representation (the one descriptor -> TargetTypeRef mapping, I6) over the compiled Source facts. These
  // fixtures need only primitive and array representations, so every target catalog input fails if it is reached.
  const unrelated = () => assert.fail("These expected-use fixtures require only published primitive and array representations.");
  const services = createCsharpRepresentationServices({
    facts: source.facts,
    platform: Object.freeze({ nativeIntegerBits: 64, targetFramework: "net10.0" }),
    profile: compiled.target.surfaces?.includes("js") === true ? "js" : "native",
    syntax: ast,
    sourceFacts: source.sourceFacts,
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    projectTypes: Object.freeze({ definitionForDeclaration: unrelated, definitionForTarget: unrelated, targetTypeForDeclaration: unrelated }),
    memoryBindings: Object.freeze({ hasBoundField: unrelated }),
    objectMethodSources: Object.freeze({ get: unrelated }),
    captureInitialization: unrelated,
    shapes: Object.freeze({ retainShape: unrelated, resolveCallableValue: unrelated }),
    typeDefinitions: program.typeDefinitions,
    genericProjections: () => [],
  });
  const represent = (descriptor, occurrence, position) => {
    assert.equal(nodes.includes(occurrence), true, "the identical compiled Source occurrence owns its native representation");
    return representSourceType(descriptor, csharpRepresentationContext(services, occurrence, position));
  };
  const policy = { ast, sourceFiles: csharpProgramSourceFiles(program), facts: source.facts,
    types: { represent },
    target: compiled.target, providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    objectShapes: program.objectShapes, projectTypes: program.projectTypes,
    typeDefinitions: program.typeDefinitions };
  const input = { policy, evidence, operations: records, objectShapes: program.objectShapes,
    callables: { contracts, declarationContracts: contracts, closedInputType: records.callableTarget.get,
      get: identity => identity.kind === "declaration" ? byDeclaration.get(identity.declaration) : undefined },
    valueReadStages: { get: node => {
      const read = records.valueRead.get(node);
      return read === undefined ? undefined : {
        literalTarget: read.selectedOperation ?? read.source,
        operationValue: read.selectedOperation ?? read.source,
      };
    } }, declarations: records, typeProjections };
  const analysis = analyzeCsharpExpectedTypes(policy, evidence, records, input.objectShapes,
    input.callables, input.valueReadStages, records, typeProjections);
  return { analysis, input, program, source, nodes };
}
