import { createCsharpIntegerRangeIndex } from "./records/operations/integer-ranges.js";
import { analyzeCsharpSourceAliasReexports } from "../source-modules/alias-reexports.js";
import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import { analyzeCsharpRepresentationIteration, representationContractsEqual, type CsharpRepresentationContract } from "./iteration.js";
import { rejectCsharpAnalysisIssues } from "./issues.js";
import { finalizeCsharpNativeEmission } from "./emission.js";

import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";


import { rejectedTargetStage, resolvedTargetStage, failTargetAnalysisInvariant, targetDiagnosticFromExtension } from "@tsonic/target-api/artifacts";
import { resolveTargetContractFixedPoint } from "@tsonic/target-api/analysis";
import { tsonicCoreAnalysisKey } from "@tsonic/source-core/facts";
import type { TargetStageResult, TargetDiagnostic } from "@tsonic/target-api/artifacts";

import { createCsharpSourceAttributeApplicationIndex } from "../attributes/application-index.js";
import { createCsharpSafetyApplicationFactIndex } from "../safety/application-index.js";
import type { CsharpAnalysisProgram, CsharpTargetAnalysisRequest } from "./model.js";
import { forwardSourceRefusal } from "./source-facts.js";
import { csharpSourceNodes } from "./source-nodes.js";
import { createCsharpSourceIdentityPolicy } from "../../source/extension/identities.js";

import { csharpTargetRepresentationContractId } from "../../target-model/identities/identities.js";
import { analyzeCsharpSourceModuleConstructions } from "../source-modules/index.js";
import { composeCsharpBinaryExecutionDriver } from "../../target-model/metadata/binary-execution-drivers.js";
import { analyzeCsharpModuleInitialization } from "../module-initialization/index.js";
import { createCsharpSourceProfileCallableAliasQuery } from "../operations/source-profiles/callable-aliases.js";
import { createCsharpSourceProfileStorageEffects } from "../operations/source-profiles/source-storage-effects.js";
import { analyzeCsharpPromiseResults } from "../callables/async/promise-results.js";
import { analyzeCsharpNativeErrorAdmission } from "../objects/error-storage-demands.js";

import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";

import { analyzeCsharpNativeValueCarriers, analyzeCsharpObjectMethodSources } from "../objects/value-carriers.js";
import { analyzeCsharpModuleCallables } from "../callables/module-callables.js";
import { analyzeCsharpSourceTypeFlowObligations } from "../source-evidence/type-flow-obligations.js";
import { analyzeCsharpDictionaryLiterals } from "../objects/dictionary-literals.js";
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
  return Object.freeze({ records: program.records, host: program.host, source: Object.freeze({ ast: program.source.syntax }) });
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
  // Every Host refusal is forwarded unchanged (code, message, site) before any C# analysis runs (R5). C# consumers
  // therefore never meet a refused Source outcome (analysis/program/source-facts.ts).
  const sourceRefusals = source.facts.refusals();
  if (sourceRefusals.length !== 0) return rejectedTargetStage(sourceRefusals.map(forwardSourceRefusal));
  // Host analysis refusals not folded into refusals() are forwarded the same way, before any C# analysis (R-C2-9).
  // The property-name issue carries its Host code (request R-B2-3: SourcePropertyNameIssue gains `code`).
  const analysisRefusals: TargetDiagnostic[] = [
    ...source.facts.analyses.enumIssues().map(issue => Object.freeze({ code: issue.code, category: "error" as const,
      source: "tsonic", message: issue.message, sourceNode: issue.sourceNode })),
    ...source.facts.analyses.propertyNameIssues().map(issue => Object.freeze({ code: issue.code, category: "error" as const,
      source: "tsonic", message: issue.reason, sourceNode: issue.node })),
  ];
  if (analysisRefusals.length !== 0) return rejectedTargetStage(analysisRefusals);
  const aliasIssues = analyzeCsharpSourceAliasReexports(source.syntax, source.sourceFiles);
  if (aliasIssues.length !== 0) return rejectedTargetStage(aliasIssues.map(diagnostic => ({
    ...targetDiagnosticFromExtension(diagnostic.nodeOrSpan, diagnostic), code: diagnostic.publicCode,
  })));
  const nativeErrors = analyzeCsharpNativeErrorAdmission(source);
  if (nativeErrors.issues.length !== 0) return rejectedTargetStage(nativeErrors.issues);
  // Host analyses are reached only through facts.analyses (supervisor ruling; I2): never with a program handle.
  // Source-core analyses are the typed extension record (request R-B2-1: memoryBindings and pointerStorage join it).
  const core = source.facts.analyses.extension(tsonicCoreAnalysisKey);
  const memoryBindings = core.memoryBindings;
  const sourceAttributeApplications = createCsharpSourceAttributeApplicationIndex(source, source.sourceFiles);
  const safetyApplications = createCsharpSafetyApplicationFactIndex({
    ast: source.syntax,
    sourceFiles: source.sourceFiles,
    sourceFacts: source.sourceFacts,
    facts: source.facts,
  });
  const statementErasure = Object.freeze({ attributeApplications: sourceAttributeApplications, safetyApplications,
    errorNameInitializations: nativeErrors.nameInitializations });
  const sourceFiles = Object.freeze([...source.sourceFiles]);
  const sourceNodes = csharpSourceNodes(source.syntax, sourceFiles);
  const moduleCallables = analyzeCsharpModuleCallables(source.syntax, sourceNodes);
  const sourceStorage = source.facts.analyses.storage({ sourceFiles, effects: createCsharpSourceProfileStorageEffects(source, providers) });
  const sourceStorageFailure = sourceStorage.failureReason();
  if (sourceStorageFailure !== undefined) return rejectedTargetStage([{
    code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", category: "error", source: "tsonic-csharp", message: sourceStorageFailure,
  }]);
  const sourceIdentities = createCsharpSourceIdentityPolicy(
    source.syntax,
    input.paths.projectRoot,
    input.sourcePackages,
  );
  const nameHost = Object.freeze({
    ast: source.syntax,
    facts: source.facts,
    sourceFiles,
    sourceIdentities,
  });
  const callOnlyAlias = createCsharpSourceProfileCallableAliasQuery(source);
  const typeHost = {
    facts: source.facts,
    // N5: the native integer width comes from the platform bridge. Every supported .NET runtime identifier of this
    // target (x64, arm64) is 64-bit; a 32-bit bridge would set 32 here.
    platform: Object.freeze({ nativeIntegerBits: 64 as const, targetFramework: configuration.targetFramework }),
    profile: input.target.surfaces?.includes("js") === true ? "js" as const : "native" as const,
    moduleCallables,
    integerRanges: createCsharpIntegerRangeIndex(source, sourceNodes),
    sourceStorage,
    callOnlyAlias,
    objectMethodSources: analyzeCsharpObjectMethodSources(source.syntax, sourceNodes, source.facts, callOnlyAlias),
    ast: source.syntax,
    sourceFiles,
    sourceFacts: source.sourceFacts,
    providers,
    pointerStorage: core.pointerStorage(sourceStorage),
    memoryBindings,
    target: input.target,
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
    const changes = transition === undefined ? [] : csharpRepresentationDifference(transition.previous, transition.repeated, sourceIdentities.node, source.syntax);
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
    ast: analysis.policy.ast, facts: analysis.policy.facts,
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
    ...memoryBindings.issues.map(issue => ({ node: issue.node, message: issue.reason, code: "CSHARP_MEMORY_BINDING_NOT_PROVEN" })),
    ...analysis.sourceEvidence.memoryMetadataIssues,
    ...analysis.typeSystem.projectTypes.issues,
    ...analysis.typeSystem.nativeConstruction.issues,
    ...analysis.operations.issues,
    ...analysis.expectedTypes.issues,
    ...analysis.conversions.issues,
    ...analysis.storage.issues,
  ];
  if (analysisIssues.length > 0) {
    return rejectCsharpAnalysisIssues(analysisIssues);
  }
  const dictionaryLiterals = analyzeCsharpDictionaryLiterals(source.syntax, analysis.nativeDemand);
  if (dictionaryLiterals.issues.length !== 0) return rejectedTargetStage(dictionaryLiterals.issues);
  const typeFlowIssues = analyzeCsharpSourceTypeFlowObligations(analysis.policy, analysis.objectShapes,
    analysis.typeSystem.nativeConstruction, dictionaryLiterals.records, analysis.sourceEvidence.compileTimeMetadata);
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
  const flowReads = analyzeCsharpFlowReadProjections({ ...callablePolicy, sourceFiles: analysis.policy.sourceFiles },
    analysis.sourceEvidence, analysis.operations, analysis.valueReads);
  if (classFactories.issues.length > 0) return rejectedTargetStage(classFactories.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  const refusals = nativeDemand.unadmitted.flatMap<TargetDiagnostic>(use => {
    if (use.kind === "source-refusal") return [use.diagnostic];
    if (use.reason === "construction-unresolved") {
      const construction = analysis.operations.selectedConstruction.get(use.expression);
      if (construction?.jsValue.kind === "rejected") return [{ sourceNode: use.expression,
        source: "tsonic-csharp", category: "error", code: construction.jsValue.code, message: construction.jsValue.reason }];
      const selected = construction?.target;
      if (selected?.kind === "missing" || selected?.kind === "conflict" || selected?.kind === "ambiguous") {
        const code = selected.kind === "missing" ? "CSHARP_TARGET_CONSTRUCTION_NOT_CLOSED"
          : selected.kind === "conflict" ? "CSHARP_TARGET_CONSTRUCTION_IDENTITY_CONFLICT" : "CSHARP_TARGET_CONSTRUCTION_AMBIGUOUS";
        return [{ sourceNode: use.expression, source: "tsonic-csharp", category: "error", code, message: selected.reason,
          ...(selected.kind === "ambiguous" ? { evidence: Object.freeze([...new Set(selected.candidates.map(candidate => `candidate=${candidate}`))]) } : {}),
        }];
      }
    }
    if (use.message === undefined && use.reason !== "argument-refused" && use.reason !== "source-argument-rejected" &&
      use.reason !== "property-key-refused") return [];
    return [{ sourceNode: use.expression, source: "tsonic-csharp", category: "error",
      code: use.code ?? failTargetAnalysisInvariant(
        "tsonic-csharp", "A native refusal requires its exact CSHARP_ code.", use.expression),
      message: use.message ?? failTargetAnalysisInvariant(
        "tsonic-csharp", "A native refusal requires its exact admitted reason.", use.expression),
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
    source.syntax, nativeDemand.requiredNativeValueDeclarations, analysis.sourceEvidence, {
      facts: source.facts,
      resolve: (descriptor, occurrence) => analysis.policy.types.represent(descriptor, occurrence, "storage"),
    }, analysis.objectShapes, analysis.requiredRecords,
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
