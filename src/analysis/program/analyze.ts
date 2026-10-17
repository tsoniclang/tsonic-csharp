import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { analyzeCsharpCaptureStorage } from "../callables/capture-storage.js";
import { analyzeCsharpNativeParticipation } from "../callables/participation.js";
import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";
import { analyzeCsharpClassFactories } from "../project-types/class-factories.js";
import { analyzeCsharpClassInitialization } from "../project-types/class-initialization.js";
import { createCsharpProgramRecords } from "./records/create.js";
import type { CsharpRequiredRecord } from "./records/required-records.js";
import { analyzeSourceLiteralValues, sourceDeclarationHasOnlyTypeUses, sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import { analyzeCsharpExactLiteralSelections } from "../conversions/literal-plans.js";
import { analyzeCsharpNativeControlFlow } from "../control-flow/native-control-flow.js";
import { analyzeCsharpTypeProjections, csharpTypeProjectionIndexesEqual } from "../declarations/type-projections.js";
import { type CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { csharpCallableValueType } from "../callables/value-type.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import type { CsharpExpectedNativeUse } from "../../target-model/records/native-demand.js";
import { analyzeCsharpNumericRepresentations } from "../numeric/representations.js";
import { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import { createCsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";
import { createTsonicPointerReturnQueries, createTsonicMemoryBindingIndex } from "@tsonic/source-core/facts";
import {
  rejectedTargetStage,
  resolvedTargetStage,
  failTargetAnalysisInvariant,
} from "@tsonic/target-api/artifacts";
import {
  resolveTargetContractFixedPoint,
  snapshotTargetPlanningSourceNavigation,
  targetSourceSyntaxProgram,
} from "@tsonic/target-api/analysis";
import type {
  TargetStageResult,
} from "@tsonic/target-api/artifacts";
import {
  createCsharpTypeAnalysis,
} from "./type-system.js";
import type {
  CsharpTypeAnalysis,
} from "./type-system.js";
import type {
  CsharpPlanningRepresentationQueries,
} from "../../policy/types/index.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/members.js";
import { analyzeCsharpAttributeApplications, createCsharpSourceAttributeApplicationIndex } from "../attributes/application-index.js";
import {
  createCsharpSafetyApplicationFactIndex,
} from "../safety/application-index.js";
import type {
  CsharpTargetAnalysisRequest,
  CsharpTargetProgram,
} from "./model.js";
import {
  createCsharpSourceIdentityPolicy,
} from "../../policy/identities/source-nodes.js";
import {
  analyzeCsharpTargetOperations,
} from "../operations/index.js";
import {
  createCsharpAnalysisPolicyContext,
} from "./policy-context.js";
import {
  analyzeCsharpSourceEvidence,
} from "../source-evidence/index.js";
import {
  analyzeCsharpDeclarations,
} from "../declarations/index.js";
import {
  createCsharpSourceNameBuilder,
} from "../names/index.js";
import {
  analyzeCsharpCallableContracts,
  csharpCallableContractIndexesEqual,
} from "../callables/index.js";
import type {
  CsharpCallableContractIndex,
} from "../callables/index.js";
import {
  analyzeCsharpObjectShapes,
} from "../objects/index.js";
import {
  analyzeCsharpConversions,
} from "../conversions/index.js";
import {
  sealCsharpProjectTypeClassifications,
} from "../project-types/index.js";
import {
  analyzeCsharpExpectedTypes,
} from "../expected-types/index.js";
import {
  analyzeCsharpStorage,
  prepareCsharpStorage,
  sealCsharpStorage,
} from "../storage/index.js";
import {
  csharpStorageClassificationsEqual,
} from "../storage/index.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import {
  analyzeCsharpProject,
} from "../project/index.js";
import {
  csharpTargetRepresentationContractId,
} from "../../target-model/identities/identities.js";
import {
  analyzeCsharpSourceModuleConstructions,
} from "../source-modules/index.js";
import {
  composeCsharpBinaryExecutionDriver,
} from "../../providers/model/provider-policy-contribution.js";
import {
  analyzeCsharpModuleInitialization,
} from "../module-initialization/index.js";
import { createCsharpSourceProfileCallableAliasQuery } from "../../policy/operations/source-profiles/callable-aliases.js";
import { createCsharpErrorStorageDemandQuery } from "../objects/error-storage-demands.js";
import { createSourceStorageQuery, type SourceStorageQueries } from "@tsonic/target-api/analysis";
import { createCsharpSourceProfileStorageEffects } from "../../policy/operations/source-profiles/source-storage-effects.js";
import { analyzeCsharpPromiseResults } from "../callables/promise-results.js";
import { analyzeCsharpRefLikePlacements } from "../storage/native-placement.js";
import { analyzeCsharpCallableCreations } from "../callables/creation.js";
import { analyzeCsharpBindingPatterns, admitCsharpBindingPatterns } from "../control-flow/binding-patterns.js";
import { admitCsharpExpectedNativeUses } from "../expected-types/native-uses.js";
import { analyzeCsharpNativeDemand } from "../operations/native-demand.js";
import { csharpJsEventLoopBinaryExecutionDriver } from "../../target-model/project/binary-execution-drivers.js";
import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";
import { analyzeCsharpValueReadStages } from "../conversions/value-read-stages.js";
import { analyzeCsharpNativeValueCarriers, analyzeCsharpObjectMethodSources } from "../objects/value-carriers.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../objects/structural-forwarding.js";

interface CsharpRepresentationContract {
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callables: CsharpCallableContractIndex;
  readonly storage: CsharpStorageClassifications;
}

type CsharpAnalysisRejection = Extract<TargetStageResult<never>, { readonly kind: "rejected" }>;

export function analyzeCsharpTargetProgram(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpTargetProgram> {
  const { input, configuration, providers } = request;
  const project = analyzeCsharpProject(
    configuration,
    input.runtimeReferences,
  );
  if (project.kind === "rejected") {
    return rejectedTargetStage(project.diagnostics);
  }
  const source = input.source;
  if (source.semantics.enumConstants.issues.length !== 0) return rejectedTargetStage(source.semantics.enumConstants.issues);
  const nativeControlIssues = analyzeCsharpNativeControlFlow(source);
  if (nativeControlIssues.length !== 0) return rejectedTargetStage(nativeControlIssues);
  const memoryBindings = createTsonicMemoryBindingIndex(source);
  const sourceAttributeApplications = createCsharpSourceAttributeApplicationIndex(source, source.navigation.sourceFiles);
  const safetyApplications = createCsharpSafetyApplicationFactIndex({
    ast: source.ast,
    sourceFiles: source.navigation.sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
  });
  const statementErasure = Object.freeze({ attributeApplications: sourceAttributeApplications, safetyApplications });
  const sourceFiles = Object.freeze([...source.navigation.sourceFiles]);
  const literalValues = analyzeSourceLiteralValues(source.ast, sourceFiles);
  const sourceStorage = createSourceStorageQuery(source, sourceFiles, undefined, createCsharpSourceProfileStorageEffects(source));
  const sourceStorageFailure = sourceStorage.failureReason();
  if (sourceStorageFailure !== undefined) return rejectedTargetStage([{
    code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", category: "error", source: "tsonic-csharp", message: sourceStorageFailure,
  }]);
  const sourceIdentities = createCsharpSourceIdentityPolicy(
    source.ast,
    input.paths.projectRoot,
    input.sourcePackages,
  );
  const nameHost = Object.freeze({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles,
    sourceIdentities,
    semanticsFor: source.semantics.forNode,
  });
  const callOnlyAlias = createCsharpSourceProfileCallableAliasQuery(source);
  const typeHost = {
    enumConstants: source.semantics.enumConstants,
    literalValues,
    sourceStorage,
    errorStorageDemands: createCsharpErrorStorageDemandQuery(source, sourceStorage),
    callOnlyAlias,
    objectMethodSources: analyzeCsharpObjectMethodSources(source.ast, sourceStorage.nodes, source.navigation, callOnlyAlias),
    ast: source.ast,
    sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
    providers,
    pointerReturns: createTsonicPointerReturnQueries(source),
    memoryBindings,
    target: input.target,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  };
  const closure = resolveTargetContractFixedPoint<CsharpRepresentationContract, CsharpAnalysisRejection>({
    roots: [csharpTargetRepresentationContractId],
    evaluate(_id, context) {
      const previous = context.get(csharpTargetRepresentationContractId);
      const evaluated = analyzeIteration(
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
      return {
        kind: "resolved",
        revision: {
          contract: Object.freeze({
            typeProjections: iteration.typeProjections,
            callables: iteration.callables,
            storage: iteration.storage,
          }),
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
    if (closure.cause !== undefined) return closure.cause;
    return rejectedTargetStage([{
      code: "CSHARP_TARGET_CONTRACT_CLOSURE_REJECTED",
      category: "error",
      source: "tsonic-csharp",
      message: closure.reason,
      evidence: Object.freeze([
        `target.contract=${closure.contractId ?? csharpTargetRepresentationContractId}`,
      ]),
    }]);
  }
  const stable = closure.program.get(csharpTargetRepresentationContractId)!;
  const evaluated = analyzeIteration(
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
  const callableAdapters = analyzeCsharpProjectCallableAdapters(analysis.policy, analysis.callables);
  const analysisIssues = [
    ...callableAdapters.issues,
    ...memoryBindings.issues.map(issue => ({ node: issue.node, message: issue.reason, code: "CSHARP_MEMORY_BINDING_NOT_PROVEN" })),
    ...analysis.sourceEvidence.memoryMetadataIssues,
    ...analysis.sourceEvidence.typeOnlyIssues,
    ...analysis.sourceEvidence.fixedArrayIssues,
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
  const attributeApplications = attributes.index;
  const moduleInitialization = analyzeCsharpModuleInitialization({
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
  const { classFactories, captureStorage, callableCreations, flowReads, nativeParticipation, classInitialization,
    numericRepresentations, exactLiterals, nativeDemand, bindingPatterns, conversions } = analysis;
  if (classFactories.issues.length > 0) return rejectedTargetStage(classFactories.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  if (captureStorage.issues.length > 0) return rejectedTargetStage(captureStorage.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  if (analysis.conversions.issues.length > 0) return rejectCsharpAnalysisIssues(analysis.conversions.issues);
  if (flowReads.issues.length > 0) return rejectCsharpAnalysisIssues(flowReads.issues);
  const sourceRefusals = nativeDemand.unadmitted.filter(use => use.kind === "source-refusal");
  if (sourceRefusals.length > 0) return rejectedTargetStage(sourceRefusals.map(use => use.diagnostic));
  const nativeValueCarriers = analyzeCsharpNativeValueCarriers(
    source.ast, nativeDemand.requiredNativeValueDeclarations, analysis.sourceEvidence, analysis.valueReads, analysis.objectShapes,
    source.semantics.forNode, analysis.requiredRecords,
  );
  if (nativeValueCarriers.issues.length > 0) return rejectCsharpAnalysisIssues(nativeValueCarriers.issues);
  if (bindingPatterns.issues.length > 0) return rejectCsharpAnalysisIssues(bindingPatterns.issues);
  const pendingUses = nativeDemand.unadmitted.filter(use => use.kind === "pending-use");
  if (pendingUses.length > 0) {
    const refusals = pendingUses.filter(use =>
      use.message !== undefined || use.reason === "argument-refused" || use.reason === "source-argument-rejected" || use.reason === "property-key-refused");
    if (refusals.length > 0) return rejectCsharpAnalysisIssues(refusals.map(use => ({
      node: use.expression, code: use.code ?? "CSHARP_UNSUPPORTED_AST", message: use.message ?? failTargetAnalysisInvariant(
        "tsonic-csharp", "A native source refusal requires its exact admitted reason.", use.expression),
    })));
    const incomplete = pendingUses[0]!;
    return failTargetAnalysisInvariant("tsonic-csharp",
      `Native consumption '${incomplete.site.role}' requires completed '${incomplete.reason}' evidence before publication.`, incomplete.expression);
  }
  if (conversions.issues.length > 0) return rejectCsharpAnalysisIssues(conversions.issues);
  if (analysis.refLikeDiagnostics.length > 0) return rejectedTargetStage(analysis.refLikeDiagnostics);
  const structuralForwarding = finalizeCsharpStructuralInterfaceForwarding(
    analysis.policy, analysis.objectShapes, callableAdapters, analysis.declarations,
  );
  if (structuralForwarding.issues.length > 0) return rejectCsharpAnalysisIssues(structuralForwarding.issues);
  const typeDefinitions = analysis.typeDefinitions.seal();
  const records = createCsharpProgramRecords({
    nativeValueCarriers,
    literalValues, exactLiterals, nativeParticipation, nativeDemand, bindingPatterns,
    flowReads, valueReads: analysis.valueReads,
    callableAdapters, callableCreations, typeProjections: analysis.typeProjections, classFactories, classInitialization, captureStorage,
    numericRepresentations, attributeApplications, safetyApplications, operations: analysis.operations,
    sourceEvidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions,
    expectedTypes: analysis.expectedTypes, storage: analysis.storage,
    sourceModuleConstructions: sourceModuleConstructions.index, moduleInitialization: moduleInitialization.index,
  }, analysis.requiredRecords);
  const promiseResults = analyzeCsharpPromiseResults({ source, storage: sourceStorage, nodes: sourceStorage.nodes, records,
    definitions: typeDefinitions, sourceCarrier: (type, file) => analysis.policy.types.resolveType(type, file) });
  if (promiseResults.diagnostics.length > 0) return rejectedTargetStage(promiseResults.diagnostics);
  const binaryExecutionDriver = composeCsharpBinaryExecutionDriver(prerequisiteBinaryExecutionDriver,
    [...promiseResults.results.values()].some(result => result.discard !== undefined) ? csharpJsEventLoopBinaryExecutionDriver : undefined);
  const program: CsharpTargetProgram = Object.freeze({
    typeDefinitions,
    records,
    promiseResults: promiseResults.results,
    classFactories: classFactories.factories,
    captureFrames: captureStorage.frames,
    host: Object.freeze({
      paths: Object.freeze({ ...input.paths }),
      entryPoint: input.project.entryPoint,
    }),
    configuration,
    project: project.value,
    source: targetSourceSyntaxProgram(source),
    sourceNavigation: snapshotTargetPlanningSourceNavigation(source),
    sourceFiles,
    projectTypes: sealCsharpProjectTypeClassifications(
      analysis.typeSystem.projectTypes,
      source.ast,
      sourceStorage.nodes,
      analysis.objectShapes,
    ),
    objectShapes: structuralForwarding.objectShapes,
    names: analysis.names.seal(),
    sourceModuleConstructions: Object.freeze({
      entries: sourceModuleConstructions.index.entries,
      from: sourceModuleConstructions.index.from,
      targets: sourceModuleConstructions.index.targets,
      bootstraps: sourceModuleConstructions.index.bootstraps,
    }),
    moduleInitialization: Object.freeze({ entrypointInitializer: moduleInitialization.index.entrypointInitializer }),
    ...(binaryExecutionDriver === undefined
      ? {}
      : { binaryExecutionDriver }),
  });
  return resolvedTargetStage(program);
}

function analyzeIteration(
  input: CsharpTargetAnalysisRequest["input"],
  providers: CsharpTargetAnalysisRequest["providers"],
  sourceFiles: readonly SourceFile[],
  sourceIdentities: ReturnType<typeof createCsharpSourceIdentityPolicy>,
  nameHost: Parameters<typeof createCsharpSourceNameBuilder>[0],
  typeHost: Parameters<typeof createCsharpTypeAnalysis>[0] &
    Pick<import("../../policy/types/project/project-types.js").CsharpProjectTypeCatalogHost, "enumConstants">,
  sourceStorage: SourceStorageQueries,
  statementErasure: Parameters<typeof analyzeCsharpTargetOperations>[2],
  previous: CsharpRepresentationContract | undefined,
) {
  const source = input.source;
  const names = createCsharpSourceNameBuilder(nameHost);
  const requiredRecords: CsharpRequiredRecord[] = [];
  let typeSystem: CsharpTypeAnalysis | undefined;
  const planningRepresentations: CsharpPlanningRepresentationQueries = {
    genericProjections(declaration) { return previous?.typeProjections.genericProjection.get(declaration) ?? []; },
    requiresClosedStructuralContract(type) {
      return previous?.storage.closedNativeContracts.some(contract => targetTypeRefEquals(contract, type)) === true;
    },
    scopedTargetType(node) {
      const storage = previous?.storage.requiredStorageType.get(node);
      if (storage !== undefined) return storage;
      if (!input.source.ast.is.IsArrowFunction(node) && !input.source.ast.is.IsFunctionExpression(node) &&
        !input.source.ast.is.IsFunctionDeclaration(node)) return undefined;
      const callable = previous?.callables.get({ kind: "declaration", declaration: node });
      return callable === undefined ? undefined : csharpCallableValueType(callable);
    },
    sourceCallable(source, sourceFile, selection) {
      return sourceCallableContract(
        input,
        source,
        sourceFile,
        typeSystem,
        previous?.callables,
        selection,
      );
    },
  };
  const representations = Object.freeze(planningRepresentations);
  const typeDefinitions = createCsharpTypeDefinitionRegistry(id => providers.findTargetBindingByTargetId(id));
  typeSystem = createCsharpTypeAnalysis(
    { ...typeHost, typeDefinitions },
    createCsharpProjectTypeCatalog(typeHost, previous?.typeProjections),
    representations,
  );
  const policyContext = createCsharpAnalysisPolicyContext({
    literalValues: typeHost.literalValues,
    callOnlyAlias: typeHost.callOnlyAlias,
    input,
    sourceFiles,
    sourceStorage,
    providers,
    sourceIdentities,
    typeSystem,
  });
  if (policyContext.issues.length > 0) return rejectCsharpAnalysisIssues(policyContext.issues);
  const policy = policyContext.policy;
  const evidence = analyzeCsharpSourceEvidence(
    input.source,
    sourceFiles,
    typeSystem.analysisTypes,
    policy,
  );
  const sourceEvidence = evidence.index;
  const operations = analyzeCsharpTargetOperations(policy, sourceEvidence, statementErasure, sourceStorage.nodes, requiredRecords);
  const valueReadStages = analyzeCsharpValueReadStages(policy, sourceEvidence, operations);
  const typeProjections = analyzeCsharpTypeProjections(input.source, sourceEvidence, operations);
  const declarations = analyzeCsharpDeclarations(
    policy,
    sourceEvidence,
    operations,
    valueReadStages.valueReadStages,
  );
  const objectShapes = analyzeCsharpObjectShapes(policy, sourceEvidence, operations);
  const callables = analyzeCsharpCallableContracts(
    policy,
    sourceEvidence,
    declarations,
    names,
    typeProjections,
    input.source,
    operations,
  );
  const expectedTypes = analyzeCsharpExpectedTypes(
    policy,
    sourceEvidence,
    operations,
    objectShapes,
    callables,
    valueReadStages.valueReadStages,
    declarations,
  );
  const conversionAnalysis = analyzeCsharpConversions(
    policy,
    sourceEvidence,
    objectShapes,
  );
  const storageRepresentations = analyzeCsharpStorage(
    policy,
    sourceEvidence,
    operations,
    objectShapes,
    expectedTypes,
    conversionAnalysis.classifications,
    declarations,
    callables,
    previous?.storage,
    requiredRecords,
  );
  const valueReads = valueReadStages.seal(storageRepresentations);
  const attributes = analyzeCsharpAttributeApplications(source, statementErasure.attributeApplications, {
    operations, conversions: conversionAnalysis.classifications, valueReads, sourceEvidence,
  });
  const preparedConversions = conversionAnalysis.prepare({
    operations,
    expectedTypes,
    valueReads,
  });
  const backingEvidence = Object.freeze({ ...sourceEvidence, inspectClosedArrayStorage: evidence.inspectClosedArrayStorage });
  const storagePreparation = prepareCsharpStorage(policy, backingEvidence, operations, storageRepresentations);
  const classFactories = analyzeCsharpClassFactories(source, typeSystem.projectTypes.catalog, sourceEvidence,
    storagePreparation.captures, names, requiredRecords);
  const captureStorage = analyzeCsharpCaptureStorage(source, objectShapes, storagePreparation.captures, sourceEvidence,
    classFactories.factories.flatMap(factory => factory.captures), names, declarations, operations, expectedTypes);
  const callableCreations = analyzeCsharpCallableCreations({
    ast: source.ast, nodes: sourceStorage.nodes, captures: captureStorage, contracts: callables,
    expectedTypes, storage: storageRepresentations, evidence: sourceEvidence, conversions: preparedConversions,
  });
  const flowReads = analyzeCsharpFlowReadProjections(policy, sourceEvidence, operations, valueReads);
  const nativeParticipation = analyzeCsharpNativeParticipation({
    ast: source.ast, nodes: sourceStorage.nodes, navigation: source.navigation,
    captureClosure: captureStorage.captureClosure, lambdaCreation: captureStorage.lambdaCreation,
    objectShapes, compileTimeMetadata: sourceEvidence.compileTimeMetadata, requiredRecords,
  });
  const classInitialization = analyzeCsharpClassInitialization(source, classFactories);
  const numericRepresentations = analyzeCsharpNumericRepresentations({ source, sourceFiles,
    evidence: sourceEvidence, operations });
  const exactLiterals = analyzeCsharpExactLiteralSelections(typeHost.literalValues, [
    ...preparedConversions.exactLiteralRequests,
    ...expectedTypes.constructions.propertyKeyRequests,
    ...expectedTypes.nativeUseSites.requests.flatMap(request => request.kind === "requested"
      ? [{ expression: request.expression, target: request.targetType }] : []),
  ]);
  const bindingCandidates = analyzeCsharpBindingPatterns({
    ast: source.ast, semanticsFor: source.semantics.forNode, sourceFiles, participation: nativeParticipation.participation,
    evidence: sourceEvidence, operations, valueReads, objectShapes,
  });
  const expectedUse = admitCsharpExpectedNativeUses(expectedTypes, {
    ast: source.ast, exactLiteral: exactLiterals.exactLiteral, callableCreation: callableCreations.callableCreation,
    valueRead: valueReads.valueRead, operations,
  });
  const initializerUses = new Map<object, CsharpExpectedNativeUse | null>();
  for (const entry of expectedUse.entries) if (entry.site.role === "initializer")
    initializerUses.set(entry.site.subject, initializerUses.has(entry.site.subject) ? null : entry.use);
  const pendingInitializers = new Set(expectedUse.pending.filter(entry => entry.site.role === "initializer")
    .map(entry => entry.site.subject));
  for (const declaration of sourceStorage.nodes) {
    if (!source.ast.is.IsVariableDeclaration(declaration) || source.ast.variableDeclarationKind(declaration) !== "const" ||
      !sourceDeclarationIsModuleScoped(declaration, source.ast) || pendingInitializers.has(declaration) ||
      !sourceDeclarationHasOnlyTypeUses(source.navigation.declarationUseSummary(declaration))) continue;
    const initializer = source.ast.as.AsVariableDeclaration(declaration)?.Initializer;
    let use = initializerUses.get(declaration);
    if (initializer === undefined || use == null || use.expression !== initializer) continue;
    const effects = source.navigation.expressionEffects(initializer);
    if (effects.invokes || effects.mutates || effects.suspends || effects.mayThrow) continue;
    const target = use.target;
    const visited = new Set<CsharpExpectedNativeUse>();
    while (use !== undefined && !visited.has(use) && use.representation === "forward" &&
      use.children.length === 1 && use.binary === undefined && use.construction === undefined &&
      targetTypeRefEquals(use.carrier, target) && targetTypeRefEquals(use.target, target)) {
      visited.add(use);
      use = expectedUse.expectedUse.get(use.children[0]!);
    }
    if (use === undefined || visited.has(use) || use.binary !== undefined || use.construction !== undefined ||
      use.children.length !== 0 || !targetTypeRefEquals(use.carrier, target) || !targetTypeRefEquals(use.target, target)) continue;
    const literal = typeHost.literalValues.literalValue.get(use.expression);
    if (literal === undefined) continue;
    const selected = exactLiterals.exactLiteral.get(use.expression, target);
    if (selected?.kind === "resolved" && use.representation === "construct" && use.literal === selected.recipe &&
      target.kind === "source-primitive" && (selected.recipe.kind !== "char" || !/[\uD800-\uDFFF]/u.test(selected.recipe.value))) {
      evidence.eraseCompileTimeDeclaration(declaration);
    } else if (selected?.kind === "source-representation" && use.representation === "forward" &&
      ((literal.form === "string" || literal.form === "template") && isCsharpStringTargetType(target) &&
          !/[\uD800-\uDFFF]/u.test(literal.text) ||
        (literal.form === "true" || literal.form === "false") && target.kind === "source-primitive" && target.name === "bool" ||
        (literal.form === "numeric" || literal.form === "prefix-unary") && literal.numeric !== undefined &&
          literal.number !== undefined && target.kind === "source-primitive" && target.name === "float64")) {
      evidence.eraseCompileTimeDeclaration(declaration);
    }
  }
  evidence.sealCompileTimeDeclarations();
  const nativeDemand = analyzeCsharpNativeDemand({
    ast: source.ast, sourceFiles, navigation: source.navigation, evidence: sourceEvidence,
    operations, valueReads, participation: nativeParticipation.participation, declarations, objectShapes,
    bindingPatterns: bindingCandidates, callableCreation: callableCreations.callableCreation, attributeApplications: attributes.index,
    propertyKeyBindings: expectedTypes.constructions.propertyKeys, exactLiteral: exactLiterals.exactLiteral,
    classInitialization, projectTypes: typeSystem.projectTypes.catalog, classFactories, expected: expectedUse,
    nativePropertyNameIssues: evidence.nativePropertyNameIssues,
  }, requiredRecords);
  const bindingPatterns = admitCsharpBindingPatterns(bindingCandidates, nativeDemand.requiredBindingRoots, requiredRecords);
  conversionAnalysis.close(nativeDemand, requiredRecords);
  const conversions = conversionAnalysis.seal();
  const refLikeDiagnostics = analyzeCsharpRefLikePlacements({
    source, nodes: sourceStorage.nodes, callables, captureStorage,
    classFactories: classFactories.factories, nativeParticipation,
    nativeDemand, operations, objectShapes, definitions: typeDefinitions,
    classPropertyStorage: operations.classPropertyStorage,
    generatorFor: declaration => sourceEvidence.generator.get(declaration) !== undefined,
    bindingCarrierFor: declaration => storageRepresentations.storageType.get(declaration),
    expressionCarrierFor: expression => valueReads.valueRead.get(expression)?.value,
  });
  const sealedObjectShapes = objectShapes.seal();
  const storage = sealCsharpStorage(policy, backingEvidence, operations, sealedObjectShapes, storagePreparation);
  return resolvedTargetStage(Object.freeze({
    policy,
    typeDefinitions,
    typeProjections,
    typeSystem,
    sourceEvidence,
    nativePropertyNameIssues: evidence.nativePropertyNameIssues,
    operations,
    declarations,
    objectShapes: sealedObjectShapes,
    callables,
    expectedTypes,
    conversions,
    storage,
    valueReads,
    requiredRecords,
    names,
    attributes,
    classFactories,
    captureStorage,
    callableCreations,
    flowReads,
    nativeParticipation,
    classInitialization,
    numericRepresentations,
    exactLiterals,
    nativeDemand,
    bindingPatterns,
    refLikeDiagnostics,
  }));
}

function rejectCsharpAnalysisIssues(
  issues: readonly { readonly node?: Node | undefined; readonly code: string; readonly message: string }[],
): TargetStageResult<never> {
  return rejectedTargetStage(issues.map(issue => ({
    code: issue.code,
    category: "error" as const,
    source: "tsonic-csharp",
    message: issue.message,
    sourceNode: issue.node,
  })));
}

function sourceCallableContract(
  input: CsharpTargetAnalysisRequest["input"],
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  typeSystem: CsharpTypeAnalysis | undefined,
  callables: CsharpCallableContractIndex | undefined,
  selection: "checked" | "implementation",
) {
  if (callables === undefined) {
    return undefined;
  }
  const selectedCallee = source.sourceCallee.selectedDeclaration;
  if (
    selectedCallee !== undefined &&
    input.source.ast.is.IsClassDeclaration(selectedCallee)
  ) {
    const constructor = typeSystem?.projectTypes.implicitConstructorForSignature(
      selectedCallee,
      source.selectedSignature,
      source.sourceSelectedSignatureParameters,
    );
    if (constructor !== undefined) {
      return callables.get({
        kind: "project-constructor",
        targetMemberId: constructor.targetMember.id,
      });
    }
  }
  const selectedDeclaration = input.source.semantics.forFile(sourceFile)
    .declarations.signatureDeclaration(source.selectedSignature);
  const implementation = selection !== "implementation" || selectedDeclaration === undefined
    ? undefined : input.source.navigation.callableImplementation(selectedDeclaration);
  const declaration = implementation?.kind === "resolved"
    ? implementation.implementation.declaration : selectedDeclaration;
  return declaration !== undefined &&
      input.source.navigation.isProjectDeclaration(declaration)
    ? callables.get({ kind: "declaration", declaration })
    : undefined;
}

function representationContractsEqual(
  left: CsharpRepresentationContract,
  right: CsharpRepresentationContract,
): boolean {
  return csharpCallableContractIndexesEqual(left.callables, right.callables) &&
    csharpStorageClassificationsEqual(left.storage, right.storage) &&
    csharpTypeProjectionIndexesEqual(left.typeProjections, right.typeProjections);
}
