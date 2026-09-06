import type {
  SourceFile,
} from "@tsonic/tsts";
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
  createCsharpTypeSystem,
} from "../../policy/types/model/system.js";
import type {
  CsharpTypeSystem,
} from "../../policy/types/model/system.js";
import type {
  CsharpPlanningRepresentationQueries,
} from "../../policy/types/index.js";
import type {
  ResolvedSourceCallInfo,
} from "../operations/index.js";
import {
  createCsharpAttributeApplicationFactIndex,
} from "../attributes/application-index.js";
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
  createCsharpSourceNameResolver,
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
} from "../object-shapes/index.js";
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
} from "../storage/index.js";
import {
  csharpStorageClassificationsEqual,
} from "../storage/index.js";
import type {
  CsharpStorageClassifications,
} from "../storage/index.js";
import {
  analyzeCsharpProject,
} from "../project/index.js";
import {
  csharpTargetRepresentationContractId,
} from "../../target-model/contracts/identities.js";
import {
  analyzeCsharpSourceModuleConstructions,
} from "../source-modules/index.js";
import {
  composeCsharpBinaryExecutionDriver,
} from "../../providers/model/provider-policy-contribution.js";
import {
  analyzeCsharpModuleInitialization,
} from "../module-initialization/index.js";

interface CsharpRepresentationContract {
  readonly callables: CsharpCallableContractIndex;
  readonly storage: CsharpStorageClassifications;
}

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
  const sourceFiles = Object.freeze([...source.navigation.sourceFiles]);
  const sourceIdentities = createCsharpSourceIdentityPolicy(
    source.ast,
    input.paths.projectRoot,
    input.sourcePackages,
  );
  const names = createCsharpSourceNameResolver({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles,
    sourceIdentities,
  });
  const typeHost = {
    ast: source.ast,
    sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
    providers,
    target: input.target,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  };
  const closure = resolveTargetContractFixedPoint<CsharpRepresentationContract>({
    roots: [csharpTargetRepresentationContractId],
    evaluate(_id, context) {
      const previous = context.get(csharpTargetRepresentationContractId);
      const iteration = analyzeIteration(
        input,
        providers,
        sourceFiles,
        sourceIdentities,
        names,
        typeHost,
        previous,
      );
      return {
        kind: "resolved",
        revision: {
          contract: Object.freeze({
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
  const analysis = analyzeIteration(
    input,
    providers,
    sourceFiles,
    sourceIdentities,
    names,
    typeHost,
    stable,
  );
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
  const analysisIssues = [
    ...analysis.sourceEvidence.memoryMetadataIssues,
    ...analysis.typeSystem.projectTypes.issues,
    ...analysis.expectedTypes.issues,
    ...analysis.conversions.issues,
    ...analysis.storage.issues,
  ];
  if (analysisIssues.length > 0) {
    return rejectedTargetStage(analysisIssues.map((issue) => ({
      code: issue.code,
      category: "error" as const,
      source: "tsonic-csharp",
      message: issue.message,
      sourceNode: issue.node,
    })));
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
  const attributeApplications = createCsharpAttributeApplicationFactIndex({
    ast: source.ast,
    sourceFiles: source.navigation.sourceFiles,
    sourceFacts: source.sourceFacts,
  });
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
    attributeApplications,
    safetyApplications,
  });
  if (moduleInitialization.issues.length > 0) {
    return rejectedTargetStage(moduleInitialization.issues.map((issue) => ({
      ...issue,
      category: "error" as const,
      source: "tsonic-csharp",
    })));
  }
  const program: CsharpTargetProgram = Object.freeze({
    host: Object.freeze({
      paths: Object.freeze({ ...input.paths }),
      entryPoint: input.project.entryPoint,
    }),
    configuration,
    project: project.value,
    source: targetSourceSyntaxProgram(source),
    sourceNavigation: snapshotTargetPlanningSourceNavigation(source),
    sourceFiles,
    attributeApplications,
    safetyApplications,
    projectTypes: sealCsharpProjectTypeClassifications(
      analysis.typeSystem.projectTypes,
      source.ast,
      sourceFiles,
    ),
    objectShapes: analysis.objectShapes,
    operations: analysis.operations,
    sourceEvidence: analysis.sourceEvidence,
    declarations: analysis.declarations,
    names,
    conversions: analysis.conversions,
    expectedTypes: analysis.expectedTypes,
    storage: analysis.storage,
    sourceModuleConstructions: sourceModuleConstructions.index,
    moduleInitialization: moduleInitialization.index,
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
  names: ReturnType<typeof createCsharpSourceNameResolver>,
  typeHost: Parameters<typeof createCsharpTypeSystem>[0],
  previous: CsharpRepresentationContract | undefined,
) {
  let typeSystem: CsharpTypeSystem | undefined;
  const planningRepresentations: CsharpPlanningRepresentationQueries = {
    scopedTargetType(node) {
      return previous?.storage.requiredType(node);
    },
    sourceCallable(source, sourceFile) {
      return sourceCallableContract(
        input,
        source,
        sourceFile,
        typeSystem,
        previous?.callables,
      );
    },
  };
  const representations = Object.freeze(planningRepresentations);
  typeSystem = createCsharpTypeSystem(typeHost, representations);
  const policy = createCsharpAnalysisPolicyContext({
    input,
    sourceFiles,
    providers,
    sourceIdentities,
    typeSystem,
  });
  const sourceEvidence = analyzeCsharpSourceEvidence(
    input.source,
    sourceFiles,
    typeSystem.analysisTypes,
    policy,
  );
  const operations = analyzeCsharpTargetOperations(policy, sourceEvidence);
  const declarations = analyzeCsharpDeclarations(
    policy,
    sourceEvidence,
    operations,
  );
  const objectShapes = analyzeCsharpObjectShapes(policy, sourceEvidence);
  const callables = analyzeCsharpCallableContracts(
    policy,
    sourceEvidence,
    declarations,
    names,
  );
  const expectedTypes = analyzeCsharpExpectedTypes(
    policy,
    sourceEvidence,
    operations,
    objectShapes,
    callables,
  );
  const conversionAnalysis = analyzeCsharpConversions(
    policy,
    sourceEvidence,
    objectShapes,
  );
  const storage = analyzeCsharpStorage(
    policy,
    sourceEvidence,
    operations,
    objectShapes,
    expectedTypes,
    conversionAnalysis.classifications,
    previous?.storage,
  );
  const conversions = conversionAnalysis.seal({
    operations,
    expectedTypes,
    storage,
  });
  return Object.freeze({
    typeSystem,
    sourceEvidence,
    operations,
    declarations,
    objectShapes,
    callables,
    expectedTypes,
    conversions,
    storage,
  });
}

function sourceCallableContract(
  input: CsharpTargetAnalysisRequest["input"],
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  typeSystem: CsharpTypeSystem | undefined,
  callables: CsharpCallableContractIndex | undefined,
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
    );
    if (constructor !== undefined) {
      return callables.get({
        kind: "project-constructor",
        targetMemberId: constructor.targetMember.id,
      });
    }
  }
  const declaration = input.source.semantics.forFile(sourceFile)
    .declarations.signatureDeclaration(source.selectedSignature);
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
    csharpStorageClassificationsEqual(left.storage, right.storage);
}
