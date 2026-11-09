import { analyzeCsharpSourceAliasReexports } from "../source-modules/alias-reexports.js";
import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import { analyzeCsharpRepresentationIteration, representationContractsEqual } from "./iteration.js";
import type { CsharpRepresentationContract } from "./model.js";
import { rejectCsharpAnalysisIssues } from "./issues.js";
import { finalizeCsharpNativeEmission } from "./emission.js";

import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";

import { createCsharpNativeLiteralQueries } from "../source-evidence/native-literals.js";

import { rejectedTargetStage, resolvedTargetStage, failTargetAnalysisInvariant, targetDiagnosticFromExtension } from "@tsonic/target-api/artifacts";
import { resolveTargetContractFixedPoint } from "@tsonic/target-api/analysis";
import type { TargetStageResult, TargetDiagnostic } from "@tsonic/target-api/artifacts";

import { createCsharpSourceAttributeApplicationIndex } from "../attributes/application-index.js";
import { createCsharpSafetyApplicationFactIndex } from "../safety/application-index.js";
import type { CsharpAnalysisProgram, CsharpTargetAnalysisRequest } from "./model.js";
import { createCsharpSourceIdentityPolicy } from "../../source/extension/identities.js";

import { csharpTargetRepresentationContractId } from "../../target-model/identities/identities.js";
import { analyzeCsharpSourceModuleConstructions } from "../source-modules/index.js";
import { composeCsharpBinaryExecutionDriver } from "../../target-model/metadata/binary-execution-drivers.js";
import { analyzeCsharpModuleInitialization } from "../module-initialization/index.js";
import { createCsharpSourceProfileCallableAliasQuery } from "../operations/source-profiles/callable-aliases.js";
import { collectCsharpNativeConstructorPremises } from "../storage/native-constructors.js";
import { forwardSourceRefusal } from "../source-evidence/representations.js";
import { analyzeCsharpPromiseResults } from "../callables/async/promise-results.js";
import { analyzeCsharpNativeErrorAdmission } from "../objects/error-storage-demands.js";


import { analyzeCsharpNativeValueCarriers, analyzeCsharpObjectMethodSources } from "../objects/value-carriers.js";
import { analyzeCsharpModuleCallables } from "../callables/module-callables.js";
import { analyzeCsharpNativeTypeObligations } from "../conversions/type-obligations.js";
import { analyzeCsharpDictionaryLiterals } from "../objects/dictionary-literals.js";
import { representCsharpSourceType } from "../../policy/types/source-type-flow/representation.js";
import { csharpRepresentationDifference } from "./representation-differences.js";

type CsharpAnalysisRejection = Extract<TargetStageResult<never>, { readonly kind: "rejected" }>;

/** Seals the analysis program into the data-only program the backend plans from. */
export function analyzeCsharpTargetProgram(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpTargetProgram> {
  const analysis = analyzeCsharpAnalysisProgram(request);
  return analysis.kind === "rejected" ? analysis : resolvedTargetStage(sealCsharpAnalysisProgram(analysis.value), analysis.diagnostics);
}

/** The sealed target program of a complete analysis program: its records, host and syntax tree only. */
export function sealCsharpAnalysisProgram(program: CsharpAnalysisProgram): CsharpTargetProgram {
  return Object.freeze({ records: program.records, host: program.host, source: Object.freeze({ ast: program.source.ast }) });
}

/** The complete analysis program: the sealed records with the analysis catalogs they were built from. */
export function analyzeCsharpAnalysisProgram(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpAnalysisProgram> {
  if (request.providerAcquisition.kind === "rejected") {
    return rejectedTargetStage([targetDiagnosticFromExtension(undefined, request.providerAcquisition.diagnostic)]);
  }
  const result = analyzeCsharpTargetProgramBeforeSeal(request);
  const failures = request.providers.failures();
  if (failures.length !== 0) return rejectedTargetStage(
    failures.map(diagnostic => targetDiagnosticFromExtension(undefined, diagnostic)),
  );
  return result;
}

function analyzeCsharpTargetProgramBeforeSeal(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpAnalysisProgram> {
  const { input, configuration, providers } = request;
  const source = input.source;
  const aliasIssues = analyzeCsharpSourceAliasReexports(source.ast, source.facts.navigation.sourceFiles);
  if (aliasIssues.length !== 0) return rejectedTargetStage(aliasIssues.map(diagnostic => ({
    ...targetDiagnosticFromExtension(diagnostic.nodeOrSpan, diagnostic), code: diagnostic.publicCode,
  })));
  const nativeErrors = analyzeCsharpNativeErrorAdmission(source);
  if (nativeErrors.issues.length !== 0) return rejectedTargetStage(nativeErrors.issues);
  const sourceAttributes = createCsharpSourceAttributeApplicationIndex(source, source.facts.navigation.sourceFiles);
  if (sourceAttributes.kind === "refused") return rejectedTargetStage([forwardSourceRefusal(sourceAttributes)]);
  const sourceAttributeApplications = sourceAttributes.value;
  const safety = createCsharpSafetyApplicationFactIndex(source);
  if (safety.kind === "refused") return rejectedTargetStage([forwardSourceRefusal(safety)]);
  const safetyApplications = safety.value;
  const statementErasure = Object.freeze({ attributeApplications: sourceAttributeApplications, safetyApplications,
    errorNameInitializations: nativeErrors.nameInitializations });
  const sourceFiles = Object.freeze([...source.facts.navigation.sourceFiles]);
  const sourceNodes = source.facts.navigation.nodesForFiles(sourceFiles);
  const moduleCallables = analyzeCsharpModuleCallables(source.ast, sourceNodes);
  const literals = createCsharpNativeLiteralQueries(source);
  const nativeConstructors = collectCsharpNativeConstructorPremises(source, providers);
  if (nativeConstructors.kind === "refused") return rejectedTargetStage([forwardSourceRefusal(nativeConstructors)]);
  const storageAnalysis = source.facts.protocols.storageAnalysis({ sourceFiles,
    nativeClassConstructors: nativeConstructors.value,
    limits: Object.freeze({ maximumNodes: 1_048_576, maximumEdges: 262_144, maximumSubjectRows: 1_048_576,
      maximumTransportRows: 4_194_304, maximumSteps: 33_554_432 }) });
  if (storageAnalysis.kind === "refused") return rejectedTargetStage([forwardSourceRefusal(storageAnalysis)]);
  if (storageAnalysis.kind === "unresolved") return rejectedTargetStage([{
    code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", category: "error", source: "tsonic-csharp", message: storageAnalysis.reason,
  }]);
  const sourceStorage = storageAnalysis.queries;
  if (sourceStorage.source !== source) return failTargetAnalysisInvariant("tsonic-csharp",
    "Native storage analysis requires the identical original Source program.");
  const memoryBindings = sourceStorage.memory.memoryBindings.inventory();
  if (memoryBindings.kind === "refused") return rejectedTargetStage([forwardSourceRefusal(memoryBindings)]);
  if (memoryBindings.kind === "unresolved") return rejectedTargetStage([{
    code: "CSHARP_MEMORY_BINDING_NOT_PROVEN", category: "error", source: "tsonic-csharp", message: memoryBindings.reason,
  }]);
  const sourceIdentities = createCsharpSourceIdentityPolicy(
    source.ast,
    input.paths.projectRoot,
    input.sourcePackages,
  );
  const nameHost = Object.freeze({
    ast: source.ast,
    navigation: source.facts.navigation,
    sourceFiles,
    sourceIdentities,
    semanticsFor: source.semantics.forNode,
  });
  const callOnlyAlias = createCsharpSourceProfileCallableAliasQuery(source);
  const typeHost = {
    source,
    effectiveTypes: source.effectiveTypes,
    moduleCallables,
    enumConstants: source.semantics.enumConstants,
    literals,
    sourceStorage,
    callOnlyAlias,
    objectMethodSources: analyzeCsharpObjectMethodSources(source.ast, sourceNodes, source.facts.navigation, callOnlyAlias),
    ast: source.ast,
    sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.facts.navigation,
    providers,
    memoryBindings: memoryBindings.value,
    target: input.target,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  };
  let transition: { readonly previous: CsharpRepresentationContract; readonly repeated: CsharpRepresentationContract } | undefined;
  const closure = resolveTargetContractFixedPoint<CsharpRepresentationContract, CsharpAnalysisRejection>({
    roots: [csharpTargetRepresentationContractId],
    evaluate(_id, context) {
      const previous = context.get(csharpTargetRepresentationContractId);
      const evaluated = analyzeCsharpRepresentationIteration(
        input,
        providers,
        sourceFiles,
        sourceIdentities,
        nameHost,
        typeHost,
        sourceStorage,
        statementErasure,
        previous,
      );
      if (evaluated.kind === "rejected") {
        return { kind: "rejected", reason: evaluated.diagnostics[0]!.message, cause: evaluated };
      }
      const iteration = evaluated.value;
      const contract = Object.freeze({ typeProjections: iteration.typeProjections, callables: iteration.callables, storage: iteration.storage });
      if (previous !== undefined) transition = { previous, repeated: contract };
      return {
        kind: "resolved",
        revision: {
          contract,
            dependencies: Object.freeze([csharpTargetRepresentationContractId]),
        },
      };
    },
    equals: representationContractsEqual,
    maximumContracts: 1,
    maximumRevisionsPerContract: 32,
    maximumEvaluations: 64,
  });
  if (closure.kind === "rejected") {
    const failure = closure.failures[0]!;
    if (closure.failures.length === 1 && failure.cause !== undefined) return failure.cause;
    const changes = transition === undefined ? [] : csharpRepresentationDifference(transition.previous, transition.repeated, sourceIdentities.node, source.ast);
    if (changes.length !== 0) process.stderr.write(`${changes.join("\n")}\n`);
    return rejectedTargetStage(closure.failures.flatMap(failure => failure.cause?.diagnostics ?? [{
      code: "CSHARP_TARGET_CONTRACT_CLOSURE_REJECTED",
      category: "error" as const,
      source: "tsonic-csharp",
      message: changes.length === 0 ? failure.reason : `${failure.reason}\n${changes.join("\n")}`,
      evidence: Object.freeze([
        `target.contract=${failure.contractId ?? csharpTargetRepresentationContractId}`,
        ...changes,
      ]),
    }]));
  }
  const stable = closure.program.get(csharpTargetRepresentationContractId)!;
  const evaluated = analyzeCsharpRepresentationIteration(
    input,
    providers,
    sourceFiles,
    sourceIdentities,
    nameHost,
    typeHost,
    sourceStorage,
    statementErasure,
    stable,
  );
  if (evaluated.kind === "rejected") return evaluated;
  const analysis = evaluated.value;
  if (!representationContractsEqual(stable, analysis)) {
    return rejectedTargetStage([{
      code: "CSHARP_TARGET_CONTRACT_SEAL_MISMATCH",
      category: "error",
      source: "tsonic-csharp",
      message:
        "C# target representation analysis changed after its dependency fixed point was sealed.",
      evidence: Object.freeze([
        `target.contract=${csharpTargetRepresentationContractId}`,
      ]),
    }]);
  }
  const callablePolicy = Object.freeze({
    ast: analysis.policy.ast, navigation: analysis.policy.facts.navigation,
    typeDefinitions: analysis.policy.typeDefinitions, projectTypes: analysis.policy.projectTypes,
    providers: analysis.policy.providers, target: analysis.policy.target, objectShapes: analysis.objectShapes,
  });
  const callableAdapterResult = analyzeCsharpProjectCallableAdapters(
    callablePolicy, analysis.callables, analysis.objectShapes, analysis.declarations, analysis.typeProjections.genericProjection,
    { names: analysis.names, storage: analysis.storage, nativeUse: analysis.nativeDemand.nativeUse,
      classPropertyStorage: analysis.operations.classPropertyStorage },
  );
  if (callableAdapterResult.kind === "rejected") return callableAdapterResult;
  const callableAdapters = callableAdapterResult.value;
  if (analysis.objectShapes.issues.length > 0) return rejectCsharpAnalysisIssues(analysis.objectShapes.issues);
  const analysisIssues = [
    ...callableAdapters.issues,
    ...memoryBindings.value.records.flatMap(record => record.selection.kind === "rejected"
      ? record.selection.issues.map(issue => ({ node: issue.node, message: issue.reason, code: "CSHARP_MEMORY_BINDING_NOT_PROVEN" })) : []),
    ...analysis.sourceEvidence.memoryMetadataIssues,
    ...analysis.typeSystem.projectTypes.issues,
    ...analysis.typeSystem.nativeConstruction.issues,
    ...analysis.operations.issues,
    ...analysis.expectedTypes.issues,
    ...analysis.conversions.issues.map(issue => ({ node: issue.diagnostic?.sourceNode ?? issue.node,
      code: issue.code, message: issue.message, source: issue.diagnostic?.source ?? "tsonic-csharp" })),
    ...analysis.storage.issues,
  ];
  if (analysisIssues.length > 0) {
    return rejectCsharpAnalysisIssues(analysisIssues);
  }
  const dictionaryLiterals = analyzeCsharpDictionaryLiterals(source.ast, analysis.nativeDemand);
  if (dictionaryLiterals.issues.length !== 0) return rejectedTargetStage(dictionaryLiterals.issues);
  const typeFlowIssues = analyzeCsharpNativeTypeObligations({ policy: analysis.policy,
    expected: analysis.expectedTypes, nativeDemand: analysis.nativeDemand,
    compileTimeMetadata: analysis.sourceEvidence.compileTimeMetadata, conversions: analysis.conversions });
  if (typeFlowIssues.length !== 0) return rejectedTargetStage(typeFlowIssues);
  const sourceModuleConstructions = analyzeCsharpSourceModuleConstructions({
    source,
    sourceFiles,
    operations: analysis.operations,
    outputType: configuration.outputType,
  });
  if (sourceModuleConstructions.issues.length > 0) {
    return rejectedTargetStage(sourceModuleConstructions.issues.map((issue) => ({
      code: issue.code,
      category: "error" as const,
      source: "tsonic-csharp",
      message: issue.message,
      sourceNode: issue.node,
    })));
  }
  const operationBinaryExecutionDriver =
    analysis.operations.binaryExecutionDriver();
  const prerequisiteBinaryExecutionDriver = composeCsharpBinaryExecutionDriver(
    request.binaryExecutionDriver,
    operationBinaryExecutionDriver,
  );
  const attributes = analysis.attributes;
  if (attributes.diagnostics.length > 0) return rejectedTargetStage(attributes.diagnostics);
  const moduleInitialization = analyzeCsharpModuleInitialization({
    moduleCallables,
    sourceEvidence: analysis.sourceEvidence,
    source,
    sourceFiles,
    projectRoot: input.paths.projectRoot,
    entryPoint: input.project.entryPoint,
    outputType: configuration.outputType,
    operations: analysis.operations,
  });
  if (moduleInitialization.issues.length > 0) {
    return rejectedTargetStage(moduleInitialization.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      evidence: issue.evidence,
      sourceNode: issue.node,
      category: "error" as const,
      source: "tsonic-csharp",
    })));
  }
  const { classFactories, captureStorage, nativeDemand, bindingPatterns } = analysis;
  const flowReads = analysis.flowReads;
  if (classFactories.issues.length > 0) return rejectedTargetStage(classFactories.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  const refusals = nativeDemand.unadmitted.flatMap<TargetDiagnostic>(use => {
    if (use.kind === "source-refusal") return [use.diagnostic];
    if (use.reason === "construction-unresolved") {
      const construction = analysis.operations.selectedConstruction.get(use.expression);
      if (construction?.jsValue.kind === "rejected") return [{ sourceNode: use.expression,
        source: "tsonic-csharp", category: "error", code: "CSHARP_UNSUPPORTED_AST", message: construction.jsValue.reason }];
      const selected = construction?.target;
      if (selected?.kind === "missing" || selected?.kind === "conflict" || selected?.kind === "ambiguous") {
        const code = selected.kind === "missing" ? "CSHARP_TARGET_CONSTRUCTION_NOT_CLOSED"
          : selected.kind === "conflict" ? "CSHARP_TARGET_CONSTRUCTION_IDENTITY_CONFLICT" : "CSHARP_TARGET_CONSTRUCTION_AMBIGUOUS";
        return [{ sourceNode: use.expression, source: "tsonic-csharp", category: "error", code, message: selected.reason,
          ...(selected.kind === "ambiguous" ? { evidence: Object.freeze([...new Set(selected.candidates.map(candidate => `candidate=${candidate}`))]) } : {}),
        }];
      }
    }
    if (use.message === undefined && use.reason !== "argument-refused" &&
      use.reason !== "property-key-refused") return [];
    return [{ sourceNode: use.expression, source: "tsonic-csharp", category: "error",
      code: use.code ?? "CSHARP_UNSUPPORTED_AST", message: use.message ?? failTargetAnalysisInvariant(
        "tsonic-csharp", "A native source refusal requires its exact admitted reason.", use.expression),
    }];
  });
  // A refused destructuring binding is the root cause of refusals at its later uses (an incomplete rest copy has no
  // callable contract for its methods), so it is reported first, with them.
  // Completed native refusals precede their capture-storage and flow consequences; all three analyses are complete.
  if (refusals.length > 0) return rejectedTargetStage([...bindingPatterns.issues.map(issue => ({ code: issue.code, category: "error" as const,
    source: "tsonic-csharp", message: issue.message, sourceNode: issue.node })), ...refusals]);
  if (captureStorage.issues.length > 0) return rejectedTargetStage(captureStorage.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  if (flowReads.issues.length > 0) return rejectCsharpAnalysisIssues(flowReads.issues);
  const nativeValueCarriers = analyzeCsharpNativeValueCarriers(
    source.ast, nativeDemand.requiredNativeValueDeclarations, analysis.sourceEvidence, {
      effectiveTypes: source.effectiveTypes,
      resolve: (descriptor, occurrence) => representCsharpSourceType(analysis.policy.types.sourceTypeFlowRepresentation(occurrence), descriptor),
    }, analysis.objectShapes,
    source.semantics.forNode, analysis.requiredRecords,
  );
  if (nativeValueCarriers.issues.length > 0) return rejectCsharpAnalysisIssues(nativeValueCarriers.issues);
  if (bindingPatterns.issues.length > 0) return rejectCsharpAnalysisIssues(bindingPatterns.issues);
  if (analysis.refLikeDiagnostics.length > 0) return rejectedTargetStage(analysis.refLikeDiagnostics);
  const promiseResults = analyzeCsharpPromiseResults({ source, projectRoot: input.paths.projectRoot,
    nodes: sourceNodes,
    records: { valueRead: analysis.valueReads.valueRead, nativeUse: nativeDemand.nativeUse,
      storageType: analysis.storage.storageType, selectedCall: analysis.operations.selectedCall,
      selectedConstruction: analysis.operations.selectedConstruction, resource: analysis.operations.resource },
    definitions: analysis.typeDefinitions, nativePlacement: analysis.refLikeDiagnostics });
  if (promiseResults.diagnostics.length > 0) return rejectedTargetStage(promiseResults.diagnostics);
  const providerFailures = providers.failures();
  if (providerFailures.length !== 0) return rejectedTargetStage(providerFailures.map(diagnostic =>
    targetDiagnosticFromExtension(undefined, diagnostic)));
  return finalizeCsharpNativeEmission(request, analysis, sourceStorage, safetyApplications,
    callableAdapters, sourceModuleConstructions, moduleInitialization, flowReads, promiseResults,
    nativeValueCarriers, prerequisiteBinaryExecutionDriver, dictionaryLiterals.records);
}
