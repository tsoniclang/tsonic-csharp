import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { analyzeCsharpCaptureStorage } from "../callables/capture-storage.js";
import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";
import { analyzeCsharpClassFactories } from "../project-types/class-factories.js";
import { analyzeCsharpClassInitialization } from "../project-types/class-initialization.js";
import { createCsharpProgramRecords } from "./records/create.js";
import { analyzeCsharpSourceLiteralValues } from "../source-evidence/literal-values.js";
import { analyzeCsharpExactLiteralSelections } from "../conversions/literal-plans.js";
import { analyzeCsharpNativeControlFlow } from "../control-flow/native-control-flow.js";
import { analyzeCsharpTypeProjections, csharpTypeProjectionIndexesEqual } from "../declarations/type-projections.js";
import { type CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { csharpCallableValueType } from "../callables/value-type.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { analyzeCsharpNumericRepresentations } from "../numeric/representations.js";
import { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import { createCsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";
import { createTsonicPointerReturnQueries, createTsonicMemoryBindingIndex } from "@tsonic/source-core/facts";
import {
  rejectedTargetStage,
  resolvedTargetStage,
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
import { analyzeCsharpAttributeApplications } from "../attributes/application-index.js";
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
import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";
import { analyzeCsharpValueReadStages } from "../conversions/value-read-stages.js";

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
  const nativeControlIssues = analyzeCsharpNativeControlFlow(source);
  if (nativeControlIssues.length !== 0) return rejectedTargetStage(nativeControlIssues);
  const memoryBindings = createTsonicMemoryBindingIndex(source);
  const sourceFiles = Object.freeze([...source.navigation.sourceFiles]);
  const literalValues = analyzeCsharpSourceLiteralValues(source.ast, sourceFiles);
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
  const names = createCsharpSourceNameBuilder({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles,
    sourceIdentities,
  });
  const typeHost = {
    literalValues,
    sourceStorage,
    errorStorageDemands: createCsharpErrorStorageDemandQuery(source, sourceStorage),
    callOnlyAlias: createCsharpSourceProfileCallableAliasQuery(source),
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
        names,
        typeHost,
        sourceStorage,
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
    names,
    typeHost,
    sourceStorage,
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
  const binaryExecutionDriver = composeCsharpBinaryExecutionDriver(
    request.binaryExecutionDriver,
    operationBinaryExecutionDriver,
  );
  const attributes = analyzeCsharpAttributeApplications(source, source.navigation.sourceFiles, {
    operations: analysis.operations, conversions: analysis.conversions,
    valueReads: analysis.valueReads, sourceEvidence: analysis.sourceEvidence,
  });
  if (attributes.diagnostics.length > 0) return rejectedTargetStage(attributes.diagnostics);
  const attributeApplications = attributes.index;
  const safetyApplications = createCsharpSafetyApplicationFactIndex({
    ast: source.ast,
    sourceFiles: source.navigation.sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
  });
  const moduleInitialization = analyzeCsharpModuleInitialization({
    sourceEvidence: analysis.sourceEvidence,
    source,
    sourceFiles,
    projectRoot: input.paths.projectRoot,
    entryPoint: input.project.entryPoint,
    outputType: configuration.outputType,
    attributeApplications,
    safetyApplications,
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
  const classFactories = analyzeCsharpClassFactories(source, analysis.typeSystem.projectTypes.catalog, analysis.sourceEvidence, analysis.storage, names);
  if (classFactories.issues.length > 0) return rejectedTargetStage(classFactories.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  const captureStorage = analyzeCsharpCaptureStorage(source, analysis.objectShapes, analysis.storage, analysis.sourceEvidence,
    classFactories.factories.flatMap(factory => factory.captures), names, analysis.declarations, analysis.operations, analysis.expectedTypes);
  if (captureStorage.issues.length > 0) return rejectedTargetStage(captureStorage.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  const flowReads = analyzeCsharpFlowReadProjections(analysis.policy, analysis.sourceEvidence, analysis.operations, analysis.valueReads);
  if (flowReads.issues.length > 0) return rejectCsharpAnalysisIssues(flowReads.issues);
  const typeDefinitions = analysis.typeDefinitions.seal();
  const classInitialization = analyzeCsharpClassInitialization(source, classFactories);
  const numericRepresentations = analyzeCsharpNumericRepresentations({ source, sourceFiles,
    evidence: analysis.sourceEvidence, operations: analysis.operations });
  const exactLiterals = analyzeCsharpExactLiteralSelections(literalValues, analysis.conversions.exactLiteralRequests);
  const records = createCsharpProgramRecords({
    literalValues, exactLiterals,
    flowReads, valueReads: analysis.valueReads,
    callableAdapters, typeProjections: analysis.typeProjections, classFactories, classInitialization, captureStorage,
    numericRepresentations, attributeApplications, safetyApplications, operations: analysis.operations,
    sourceEvidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions: analysis.conversions,
    expectedTypes: analysis.expectedTypes, storage: analysis.storage,
    sourceModuleConstructions: sourceModuleConstructions.index, moduleInitialization: moduleInitialization.index,
  });
  const program: CsharpTargetProgram = Object.freeze({
    typeDefinitions,
    records,
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
    ),
    objectShapes: analysis.objectShapes,
    names: names.seal(),
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
  names: ReturnType<typeof createCsharpSourceNameBuilder>,
  typeHost: Parameters<typeof createCsharpTypeAnalysis>[0],
  sourceStorage: SourceStorageQueries,
  previous: CsharpRepresentationContract | undefined,
) {
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
  const operations = analyzeCsharpTargetOperations(policy, sourceEvidence);
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
  );
  const valueReads = valueReadStages.seal(storageRepresentations);
  const conversions = conversionAnalysis.seal({
    operations,
    expectedTypes,
    valueReads,
  });
  const sealedObjectShapes = objectShapes.seal();
  const storage = sealCsharpStorage(policy,
    Object.freeze({ ...sourceEvidence, inspectClosedArrayStorage: evidence.inspectClosedArrayStorage }),
    operations, sealedObjectShapes, storageRepresentations);
  return resolvedTargetStage(Object.freeze({
    policy,
    typeDefinitions,
    typeProjections,
    typeSystem,
    sourceEvidence,
    operations,
    declarations,
    objectShapes: sealedObjectShapes,
    callables,
    expectedTypes,
    conversions,
    storage,
    valueReads,
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
