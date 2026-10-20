import { CsharpProviderAcquisitionRejection, csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { analyzeCsharpCaptureStorage } from "../callables/capture-storage.js";
import { analyzeCsharpNativeConstants } from "../expressions/native-constants.js";
import { analyzeCsharpBinaryEmission } from "../expressions/binary-emission.js";
import { admitCsharpLocationRetention } from "../storage/location-retention.js";
import { analyzeCsharpNativeParticipation } from "../callables/participation.js";
import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";
import { analyzeCsharpClassFactories } from "../project-types/class-factories.js";
import { analyzeCsharpClassInitialization } from "../project-types/class-initialization.js";
import { createCsharpProgramRecords } from "./records/create.js";
import { analyzeCsharpSourceArtifacts } from "../source-modules/artifacts.js";
import { analyzeCsharpArrayLiterals } from "../expressions/array-literals.js";
import { analyzeCsharpPropertyAdmission } from "../objects/property-admission.js";
import { analyzeCsharpOptionalCallChains } from "../callables/optional-call-chains.js";
import { analyzeCsharpElementAdmission } from "../objects/element-admission.js";
import { analyzeCsharpSourceReferences } from "../expressions/source-references.js";
import { analyzeCsharpMemberReceivers } from "../objects/member-receivers.js";
import { analyzeCsharpSourceCallEmission } from "../callables/source-call-emission.js";
import { analyzeCsharpTargetArguments } from "../callables/target-arguments.js";
import { analyzeCsharpArgumentPassing } from "../callables/argument-passing.js";
import { analyzeCsharpTargetCallEmission } from "../callables/target-call-emission.js";
import { analyzeCsharpConstructionEmission } from "../project-types/construction-emission.js";
import { analyzeCsharpLiteralAdmission } from "../expressions/literals.js";
import { analyzeCsharpAwaitAdmission } from "../callables/await-admission.js";
import { analyzeCsharpVoidAdmission } from "../expressions/expression-void.js";
import { analyzeCsharpJsValueBoxing } from "../expressions/js-value-boxing.js";
import { analyzeCsharpConditions } from "../expressions/conditions.js";
import { analyzeCsharpTemplateStrings } from "../expressions/template-strings.js";
import { analyzeCsharpPropertyValueProjection } from "../conversions/property-value-projection.js";
import { analyzeCsharpStructuralObjectEmission } from "../objects/structural-emission.js";
import { analyzeCsharpAuthoredObjectMethods } from "../objects/authored-methods.js";
import { analyzeCsharpObjectMemberEmission } from "../objects/member-emission.js";
import { analyzeCsharpObjectLiterals } from "../objects/object-literals.js";
import { analyzeCsharpIndexedRecords } from "../objects/indexed-records.js";
import { analyzeCsharpFrozenDataProperties } from "../objects/frozen-data-properties.js";
import { analyzeCsharpCaptureMethods } from "../objects/capture-methods.js";
import { analyzeCsharpDeclarationModifiers } from "../declarations/classes/modifiers.js";
import { analyzeCsharpNativeDeclarationForms } from "../declarations/native-forms.js";
import { analyzeCsharpStructuralInterfaceEmission } from "../declarations/interfaces/structural.js";
import { analyzeCsharpLexicalValues } from "../callables/lexical-values.js";
import { analyzeCsharpClassFieldInitialization } from "../project-types/class-initialization.js";
import { analyzeCsharpCallableParameterEmission } from "../callables/parameters.js";
import { analyzeCsharpCallableDeclarationEmission } from "../callables/declaration-emission.js";
import { analyzeCsharpMethodEmission } from "../declarations/classes/methods.js";
import { analyzeCsharpClassEmission } from "../declarations/classes/planning.js";
import { analyzeCsharpProjectEmission } from "../project-types/emission.js";
import { analyzeCsharpTypeParameterEmission } from "../declarations/type-parameters.js";
import { analyzeCsharpTypeEmission } from "../types/emission.js";
import { analyzeCsharpNativeMemoryEmission } from "../operations/native-memory-emission.js";
import { admitCsharpUnionProjections } from "../operations/union-projections.js";
import { analyzeCsharpUnionEquality } from "../operations/union-equality.js";
import { analyzeCsharpClosedTypeTests } from "../expressions/type-tests.js";
import { analyzeCsharpTypeofEmission } from "../expressions/typeof-emission.js";
import { analyzeCsharpUnaryEmission } from "../expressions/expression-unary.js";
import { analyzeCsharpThisEmission } from "../expressions/expression-this.js";
import { analyzeCsharpSourceMemberNames } from "../objects/source-member-names.js";
import { analyzeCsharpReceiverCallProperties } from "../operations/receiver-call-property.js";
import { analyzeCsharpRestSequences } from "../callables/rest-sequences.js";
import { analyzeCsharpJsCalls } from "../expressions/js-value-calls.js";
import { analyzeCsharpCallAdmission } from "../callables/call-admission.js";
import { analyzeCsharpIdentifierEmission } from "../names/source-identifiers.js";
import { analyzeCsharpSourceFileEmission } from "../source-modules/emission.js";
import { analyzeCsharpStartup } from "../source-modules/startup.js";
import { analyzeCsharpSafetyEmission } from "../safety/emission.js";
import { analyzeCsharpStatementExits } from "../control-flow/statement-exits.js";
import { analyzeCsharpStatementCompletions } from "../control-flow/statement-completion.js";
import { analyzeCsharpResourceScopes } from "../control-flow/resource-scopes.js";
import { analyzeCsharpLocalBindings } from "../storage/local-bindings.js";
import { analyzeCsharpBindingIdentities } from "../storage/binding-identities.js";
import { analyzeCsharpSourceOutputIdentities } from "../names/source-output-identities.js";
import { createCsharpObjectShapeRecords } from "./records/object-shapes.js";
import { analyzeCsharpObjectShapeEmission } from "../objects/declaration-emission.js";
import { analyzeCsharpSourceUnionEmission } from "../objects/source-union-emission.js";
import { analyzeCsharpGenerators } from "../callables/generators.js";
import type { CsharpRequiredRecord } from "./records/required-records.js";
import { analyzeSourceLiteralValues, sourceDeclarationHasOnlyTypeUses, sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import { analyzeCsharpExactLiteralSelections } from "../conversions/literal-plans.js";
import { analyzeCsharpNativeControlFlow, admitCsharpStatementBindings, admitCsharpIterationBindings, admitCsharpNativeStorageBindings } from "../control-flow/native-control-flow.js";
import { analyzeCsharpTypeProjections, csharpTypeProjectionIndexesEqual } from "../declarations/type-projections.js";
import { type CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { csharpCallableValueType } from "../callables/value-type.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { isCsharpNeverTargetType } from "../../target-model/types/carriers/scalar-types.js";
import type { CsharpExpectedNativeUse } from "../../target-model/records/native-demand.js";
import { analyzeCsharpNumericRepresentations } from "../numeric/representations.js";
import { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import { createCsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";
import { createTsonicPointerReturnQueries, createTsonicMemoryBindingIndex } from "@tsonic/source-core/facts";
import {
  rejectedTargetStage,
  resolvedTargetStage,
  failTargetAnalysisInvariant,
  targetDiagnosticFromExtension,
} from "@tsonic/target-api/artifacts";
import {
  resolveTargetContractFixedPoint,
  snapshotTargetPlanningSourceNavigation,
  targetSourceSyntaxProgram,
} from "@tsonic/target-api/analysis";
import type {
  TargetStageResult,
  TargetDiagnostic,
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
  admitCsharpNativeDeclarations,
  admitCsharpRawInterfaceDeclarations,
} from "../declarations/index.js";
import {
  createCsharpSourceNameBuilder,
  analyzeCsharpNativeMemberNames,
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
import { analyzeCsharpGenericAdoption, analyzeCsharpPromiseResults } from "../callables/promise-results.js";
import { analyzeCsharpRefLikePlacements } from "../storage/native-placement.js";
import { analyzeCsharpCallableCreations } from "../callables/creation.js";
import { analyzeCsharpBindingPatterns, admitCsharpBindingPatterns } from "../control-flow/binding-patterns.js";
import { admitCsharpExpectedNativeUses } from "../expected-types/native-uses.js";
import { analyzeCsharpNativeDemand } from "../operations/native-demand.js";
import { csharpJsEventLoopBinaryExecutionDriver } from "../../target-model/project/binary-execution-drivers.js";
import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";
import { analyzeCsharpValueReadStages } from "../conversions/value-read-stages.js";
import { analyzeCsharpNativeValueCarriers, analyzeCsharpObjectMethodSources } from "../objects/value-carriers.js";
import { analyzeCsharpNativeArtifactDemand, publishCsharpNativeArtifactDemand } from "../objects/native-demand.js";

interface CsharpRepresentationContract {
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callables: CsharpCallableContractIndex;
  readonly storage: CsharpStorageClassifications;
}

type CsharpAnalysisRejection = Extract<TargetStageResult<never>, { readonly kind: "rejected" }>;

export function analyzeCsharpTargetProgram(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpTargetProgram> {
  try {
    return analyzeCsharpTargetProgramBeforeSeal(request);
  } catch (error) {
    if (error instanceof CsharpProviderAcquisitionRejection) {
      return rejectedTargetStage([targetDiagnosticFromExtension(undefined, error.diagnostic)]);
    }
    throw error;
  }
}

function analyzeCsharpTargetProgramBeforeSeal(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpTargetProgram> {
  const { input, configuration, providers } = request;
  const project = analyzeCsharpProject(
    configuration,
    input.runtimeReferences,
    input.paths.cacheRoot,
  );
  if (project.kind === "rejected") {
    return rejectedTargetStage(project.diagnostics);
  }
  providers.prepareRuntimeSources(Object.freeze({
    sources: project.value.runtimeSources,
    projects: project.value.runtimeProjects,
    project: project.value.project,
    properties: project.value.properties,
    cacheRoot: input.paths.cacheRoot,
  }));
  const source = input.source;
  if (source.semantics.enumConstants.issues.length !== 0) return rejectedTargetStage(source.semantics.enumConstants.issues);
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
  const genericAdoption = analyzeCsharpGenericAdoption({ source, projectRoot: input.paths.projectRoot, storage: sourceStorage });
  if (genericAdoption.length !== 0) return rejectedTargetStage(genericAdoption);
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
    const failure = closure.failures[0]!;
    if (closure.failures.length === 1 && failure.cause !== undefined) return failure.cause;
    return rejectedTargetStage(closure.failures.flatMap(failure => failure.cause?.diagnostics ?? [{
      code: "CSHARP_TARGET_CONTRACT_CLOSURE_REJECTED",
      category: "error" as const,
      source: "tsonic-csharp",
      message: failure.reason,
      evidence: Object.freeze([
        `target.contract=${failure.contractId ?? csharpTargetRepresentationContractId}`,
      ]),
    }]));
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
  const callablePolicy = Object.freeze({
    ast: analysis.policy.ast, navigation: analysis.policy.navigation,
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
  const analysisIssues = [
    ...callableAdapters.issues,
    ...memoryBindings.issues.map(issue => ({ node: issue.node, message: issue.reason, code: "CSHARP_MEMORY_BINDING_NOT_PROVEN" })),
    ...analysis.sourceEvidence.memoryMetadataIssues,
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
  const { classFactories, captureStorage, callableCreations, nativeParticipation, classInitialization,
    exactLiterals, nativeDemand, bindingPatterns, conversions } = analysis;
  const flowReads = analyzeCsharpFlowReadProjections({ ...callablePolicy, sourceFiles: analysis.policy.sourceFiles },
    analysis.sourceEvidence, analysis.operations, analysis.valueReads);
  const numericRepresentations = analyzeCsharpNumericRepresentations({ source, sourceFiles,
    evidence: analysis.sourceEvidence, operations: analysis.operations });
  if (classFactories.issues.length > 0) return rejectedTargetStage(classFactories.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  if (captureStorage.issues.length > 0) return rejectedTargetStage(captureStorage.issues.map(issue => ({
    code: issue.code, category: "error" as const, source: "tsonic-csharp", sourceNode: issue.node, message: issue.message,
  })));
  if (flowReads.issues.length > 0) return rejectCsharpAnalysisIssues(flowReads.issues);
  const refusals = nativeDemand.unadmitted.flatMap<TargetDiagnostic>(use => {
    if (use.kind === "source-refusal") return [use.diagnostic];
    if (use.reason === "construction-unresolved") {
      const construction = analysis.operations.selectedConstruction.get(use.expression);
      if (construction?.jsValue.kind === "rejected") return [{ sourceNode: use.expression,
        source: "tsonic-csharp", category: "error", code: "CSHARP_UNSUPPORTED_AST", message: construction.jsValue.reason }];
      const selected = construction?.target;
      if (selected?.kind === "rejected") return [targetDiagnosticFromExtension(use.expression, selected.diagnostic)];
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
      code: use.code ?? "CSHARP_UNSUPPORTED_AST", message: use.message ?? failTargetAnalysisInvariant(
        "tsonic-csharp", "A native source refusal requires its exact admitted reason.", use.expression),
    }];
  });
  if (refusals.length > 0) return rejectedTargetStage(refusals);
  const nativeValueCarriers = analyzeCsharpNativeValueCarriers(
    source.ast, nativeDemand.requiredNativeValueDeclarations, analysis.sourceEvidence, analysis.valueReads, analysis.objectShapes,
    source.semantics.forNode, analysis.requiredRecords,
  );
  if (nativeValueCarriers.issues.length > 0) return rejectCsharpAnalysisIssues(nativeValueCarriers.issues);
  if (bindingPatterns.issues.length > 0) return rejectCsharpAnalysisIssues(bindingPatterns.issues);
  if (analysis.refLikeDiagnostics.length > 0) return rejectedTargetStage(analysis.refLikeDiagnostics);
  const promiseResults = analyzeCsharpPromiseResults({ source, genericAdoption,
    storage: sourceStorage, nodes: sourceStorage.nodes,
    records: { valueRead: analysis.valueReads.valueRead, selectedCall: analysis.operations.selectedCall,
      selectedConstruction: analysis.operations.selectedConstruction },
    definitions: analysis.typeDefinitions, nativePlacement: analysis.refLikeDiagnostics,
    sourceCarrier: (type, file) => analysis.policy.types.resolveType(type, file) });
  if (promiseResults.diagnostics.length > 0) return rejectedTargetStage(promiseResults.diagnostics);
  const typeDefinitions = analysis.typeDefinitions.seal();
  const projectTypes = sealCsharpProjectTypeClassifications(
    analysis.typeSystem.projectTypes, source.ast, sourceStorage.nodes, analysis.objectShapes,
  );
  const sourceSyntax = targetSourceSyntaxProgram(source);
  const admittedIterations = admitCsharpIterationBindings(analysis.policy, sourceStorage.nodes,
    nativeDemand.nativeUse, analysis.operations, analysis.storage,
    nativeParticipation.participation, analysis.sourceEvidence.compileTimeMetadata);
  const admittedOperations = admittedIterations.operations;
  const admittedControlNode = (node: Node): boolean => nativeDemand.nativeUse.order(node) !== undefined &&
    !analysis.sourceEvidence.compileTimeMetadata.get(node) &&
    !admittedOperations.nativeUnreachable.get(node) && nativeParticipation.participation.get(node) !== "erased";
  const literalEmission = analyzeCsharpLiteralAdmission({ ast: source.ast, demand: nativeDemand, literals: literalValues,
    exact: exactLiterals, values: analysis.valueReads });
  const templateStrings = analyzeCsharpTemplateStrings(source.ast, nativeDemand);
  const unionEquality = analyzeCsharpUnionEquality(sourceStorage.nodes, admittedOperations);
  const closedTypeTests = analyzeCsharpClosedTypeTests(sourceStorage.nodes, admittedOperations, typeDefinitions);
  const jsValueBoxing = analyzeCsharpJsValueBoxing({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads, exact: exactLiterals });
  const unaryEmission = analyzeCsharpUnaryEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, literals: literalValues, exact: exactLiterals });
  const typeofEmission = analyzeCsharpTypeofEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, values: analysis.valueReads, factories: classFactories, definitions: typeDefinitions });
  const receiverCallProperties = analyzeCsharpReceiverCallProperties(sourceStorage.nodes, admittedOperations, admittedControlNode);
  const restSequences = analyzeCsharpRestSequences(sourceStorage.nodes, admittedOperations, analysis.valueReads, admittedControlNode);
  const jsCalls = analyzeCsharpJsCalls(source.ast, sourceStorage.nodes, admittedOperations, admittedControlNode);
  const callAdmission = analyzeCsharpCallAdmission(source.ast, sourceStorage.nodes, admittedOperations, analysis.valueReads, admittedControlNode);
  const optionalCallChains = analyzeCsharpOptionalCallChains(source.ast, sourceStorage.nodes, admittedOperations, nativeDemand, admittedControlNode);
  const nonCallableIssues = [
    ...admitCsharpUnionProjections(sourceStorage.nodes, admittedOperations, typeDefinitions),
    ...literalEmission.issues,
    ...unionEquality.issues,
    ...closedTypeTests.issues,
    ...jsValueBoxing.issues,
    ...unaryEmission.issues,
    ...typeofEmission.issues,
    ...receiverCallProperties.issues,
    ...restSequences.issues,
    ...jsCalls.issues,
    ...callAdmission.issues,
    ...optionalCallChains.issues,
    ...analyzeCsharpConditions({ ast: source.ast, demand: nativeDemand, operations: admittedOperations, values: analysis.valueReads }),
    ...analyzeCsharpVoidAdmission({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads, operations: admittedOperations }),
    ...analyzeCsharpAwaitAdmission({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads, operations: admittedOperations }),
    ...admittedIterations.issues,
    ...admitCsharpStatementBindings(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      admittedOperations, analysis.storage, analysis.sourceEvidence.generator,
      nativeParticipation.participation, analysis.sourceEvidence.compileTimeMetadata,
      analysis.valueReads.valueRead),
    ...admitCsharpNativeDeclarations(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      projectTypes, source.navigation, analysis.sourceEvidence, analysis.storage,
      nativeParticipation.participation, admittedOperations.nativeUnreachable,
      analysis.declarations, callableAdapters.callableDispatch, classFactories.classFactory, captureStorage),
    ...admitCsharpNativeStorageBindings(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      analysis.storage, admittedOperations.nativeRefReturn, nativeParticipation.participation,
      analysis.sourceEvidence.compileTimeMetadata, admittedOperations.nativeUnreachable),
  ];
  if (nonCallableIssues.length > 0) return rejectedTargetStage(nonCallableIssues);
  const pendingUses = nativeDemand.unadmitted.filter(use => use.kind === "pending-use");
  if (pendingUses.length > 0) {
    const incomplete = pendingUses[0]!;
    return failTargetAnalysisInvariant("tsonic-csharp",
      `Native consumption '${incomplete.site.role}' requires completed '${incomplete.reason}' evidence before publication.`, incomplete.expression);
  }
  const objectShapeClosure = analyzeCsharpNativeArtifactDemand({
    ast: source.ast, sourceFiles, propertyNames: sourceSyntax.propertyNames,
    nativeDemand, participation: nativeParticipation.participation,
    objectShapes: callableAdapters.objectShapes, projectTypes, typeDefinitions,
    valueReads: analysis.valueReads, operations: admittedOperations, storage: analysis.storage,
    callables: analysis.callables, captureStorage, callableAdapters, flowReads, declarations: analysis.declarations,
    bindingPatterns, conversions, nativeValueCarriers, sourceEvidence: analysis.sourceEvidence,
  }, analysis.requiredRecords);
  if (objectShapeClosure.kind === "rejected") return objectShapeClosure;
  const nativeMemberNames = analyzeCsharpNativeMemberNames({
    ast: source.ast, nodes: sourceStorage.nodes, nativeUse: nativeDemand.nativeUse,
    metadata: analysis.sourceEvidence, participation: nativeParticipation.participation,
    unreachable: admittedOperations.nativeUnreachable, projectTypes, names: analysis.names,
    dispatch: callableAdapters.callableDispatch, writes: analysis.declarations.methodWrite,
    factories: classFactories.classFactory, helperAccess: captureStorage.helperAccess,
    requiredBindingRoots: nativeDemand.requiredBindingRoots, artifactClosure: objectShapeClosure.value,
    nativeValueCarriers, storage: analysis.storage, moduleInitialization: moduleInitialization.index,
    callables: analysis.callables, callableCreations, classPropertyStorage: admittedOperations.classPropertyStorage,
    captureFrameShape: captureStorage.captureFrameShape, capturedBinding: captureStorage.capturedBinding,
    providers: analysis.policy.providers,
  });
  if (nativeMemberNames.issues.length > 0) return rejectedTargetStage(nativeMemberNames.issues);
  const names = analysis.names.seal(nativeDemand.requiredBindingRoots, nativeMemberNames);
  if (names.issues.length > 0) return rejectedTargetStage(names.issues);
  const sourceMemberNames = analyzeCsharpSourceMemberNames({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations, names, admitted: admittedControlNode });
  if (sourceMemberNames.issues.length !== 0) return rejectedTargetStage(sourceMemberNames.issues);
  const objectShapeDemand = publishCsharpNativeArtifactDemand(objectShapeClosure.value, names);
  const rawInterfaceIssues = admitCsharpRawInterfaceDeclarations(source.ast, sourceStorage.nodes,
    nativeDemand.nativeUse, callableAdapters.objectShapes, objectShapeDemand, analysis.storage,
    analysis.sourceEvidence.compileTimeMetadata, nativeParticipation.participation,
    admittedOperations.nativeUnreachable);
  if (rawInterfaceIssues.length > 0) return rejectedTargetStage(rawInterfaceIssues);
  const statementCompletions = analyzeCsharpStatementCompletions({ ast: source.ast, nodes: sourceStorage.nodes,
    returnContexts: analysis.expectedTypes.returnContext, returnContracts: analysis.declarations.returnContract,
    values: analysis.valueReads.valueRead,
    nativeUse: nativeDemand.nativeUse, storage: analysis.storage.storageType,
    admitted: admittedControlNode, required: analysis.requiredRecords, facts: {
      erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
        admittedOperations.nativeUnreachable.get(node) === true || admittedOperations.erasedStatement.get(node) === true ||
        nativeParticipation.participation.get(node) === "erased",
      expressionExits: node => isCsharpNeverTargetType(analysis.valueReads.valueRead.get(node)?.value),
      guardResult: node => admittedOperations.nativeGuardResult.get(node),
    } });
  const nativeControlIssues = analyzeCsharpNativeControlFlow(source, statementCompletions.controlExit, admittedControlNode);
  if (nativeControlIssues.length !== 0) return rejectedTargetStage(nativeControlIssues);
  const statementExits = analyzeCsharpStatementExits({ ast: source.ast, nodes: sourceStorage.nodes,
    operations: admittedOperations, metadata: analysis.sourceEvidence.compileTimeMetadata,
    participation: nativeParticipation.participation, values: analysis.valueReads.valueRead,
    required: analysis.requiredRecords });
  const generators = analyzeCsharpGenerators({ ast: source.ast, nodes: sourceStorage.nodes, evidence: analysis.sourceEvidence,
    admitted: admittedControlNode, erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
      admittedOperations.nativeUnreachable.get(node) === true || nativeParticipation.participation.get(node) === "erased",
    required: analysis.requiredRecords });
  if (generators.issues.length !== 0) return rejectedTargetStage(generators.issues);
  const callableDeclarations = analyzeCsharpCallableDeclarationEmission({ ast: source.ast, nodes: sourceStorage.nodes,
    admitted: admittedControlNode, declarations: analysis.declarations, generators: generators.records });
  if (callableDeclarations.issues.length !== 0) return rejectedTargetStage(callableDeclarations.issues);
  const lexicalValues = analyzeCsharpLexicalValues({ nodes: sourceStorage.nodes, navigation: source.navigation,
    captures: captureStorage, values: analysis.valueReads, metadata: analysis.sourceEvidence });
  if (lexicalValues.issues.length !== 0) return rejectedTargetStage(lexicalValues.issues);
  const callableParameters = analyzeCsharpCallableParameterEmission({ ast: source.ast, nodes: sourceStorage.nodes,
    declarations: analysis.declarations, values: analysis.valueReads, storage: analysis.storage, conversions, literals: literalValues,
    exact: exactLiterals, admitted: admittedControlNode, required: analysis.requiredRecords });
  if (callableParameters.issues.length !== 0) return rejectedTargetStage(callableParameters.issues);
  const classEmission = analyzeCsharpClassEmission({ ast: source.ast, nodes: sourceStorage.nodes, projectTypes, factories: classFactories,
    captures: captureStorage, storage: analysis.storage, names, admitted: admittedControlNode });
  if (classEmission.issues.length !== 0) return rejectedTargetStage(classEmission.issues);
  const sourceOutputIdentities = analyzeCsharpSourceOutputIdentities({ ast: source.ast, sourceFiles, paths: input.paths,
    namespace: project.value.namespace, sourceFacts: source.sourceFacts,
    generatedTypeNames: [...projectTypes.declarationScopeNames, ...classFactories.factories.flatMap(factory => [
      factory.instanceScope, factory.factoryName, ...(factory.identity === undefined ? [] : [factory.identity.name]),
    ])] });
  if (sourceOutputIdentities.kind === "rejected") return rejectedTargetStage(sourceOutputIdentities.diagnostics);
  const objectShapeEmission = analyzeCsharpObjectShapeEmission({ ast: source.ast, nodes: sourceStorage.nodes, nativeDemand, bindings: bindingPatterns,
    demand: objectShapeDemand, shapes: callableAdapters.objectShapes, names });
  if (objectShapeEmission.issues.length !== 0) return rejectedTargetStage(objectShapeEmission.issues);
  const structuralObjectEmission = analyzeCsharpStructuralObjectEmission({ shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, storage: analysis.storage });
  if (structuralObjectEmission.issues.length !== 0) return rejectedTargetStage(structuralObjectEmission.issues);
  const objectMethods = analyzeCsharpAuthoredObjectMethods({ ast: source.ast, shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, captures: captureStorage });
  if (objectMethods.issues.length !== 0) return rejectedTargetStage(objectMethods.issues);
  const objectMembers = analyzeCsharpObjectMemberEmission({ shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, storage: analysis.storage, captures: captureStorage });
  if (objectMembers.issues.length !== 0) return rejectedTargetStage(objectMembers.issues);
  const objectLiterals = analyzeCsharpObjectLiterals({ source: sourceSyntax, demand: nativeDemand, shapes: callableAdapters.objectShapes,
    operations: admittedOperations, methods: objectMethods.records, members: objectMembers.records, storage: analysis.storage });
  if (objectLiterals.issues.length !== 0) return rejectedTargetStage(objectLiterals.issues);
  const thisEmission = analyzeCsharpThisEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    captures: captureStorage, initialization: classInitialization, factories: classFactories, values: analysis.valueReads,
    shapes: callableAdapters.objectShapes, methods: objectMethods.records, literals: objectLiterals.records });
  if (thisEmission.issues.length !== 0) return rejectedTargetStage(thisEmission.issues);
  const indexedRecords = analyzeCsharpIndexedRecords(sourceStorage.nodes, admittedOperations);
  if (indexedRecords.issues.length !== 0) return rejectedTargetStage(indexedRecords.issues);
  const frozenDataProperties = analyzeCsharpFrozenDataProperties({ ast: source.ast, demand: objectShapeDemand, members: objectMembers.records,
    storage: analysis.storage, operations: admittedOperations, attributes: attributeApplications });
  if (frozenDataProperties.issues.length !== 0) return rejectedTargetStage(frozenDataProperties.issues);
  const captureMethods = analyzeCsharpCaptureMethods(source.ast, captureStorage);
  if (captureMethods.issues.length !== 0) return rejectedTargetStage(captureMethods.issues);
  const projectEmission = analyzeCsharpProjectEmission({ source, nodes: sourceStorage.nodes, projectTypes,
    factories: classFactories, evidence: analysis.sourceEvidence, names, projections: analysis.typeProjections });
  if (projectEmission.issues.length !== 0) return rejectedTargetStage(projectEmission.issues);
  const sourceReferences = analyzeCsharpSourceReferences({ source, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    evidence: analysis.sourceEvidence, factories: classFactories, captures: captureStorage, demand: nativeDemand,
    operations: admittedOperations, files: sourceOutputIdentities.records, backing: analysis.storage.nativeBacking });
  if (sourceReferences.issues.length !== 0) return rejectedTargetStage(sourceReferences.issues);
  const memberReceivers = analyzeCsharpMemberReceivers({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    references: sourceReferences.records, projects: projectEmission.records, factories: classFactories, admitted: admittedControlNode });
  if (memberReceivers.issues.length !== 0) return rejectedTargetStage(memberReceivers.issues);
  const propertyAdmission = analyzeCsharpPropertyAdmission({ ast: source.ast, nodes: sourceStorage.nodes,
    operations: admittedOperations, admitted: admittedControlNode, projectDeclaration: node => source.navigation.isProjectDeclaration(node), receivers: memberReceivers.records,
    modules: sourceReferences.records.sourceModuleReference });
  if (propertyAdmission.issues.length !== 0) return rejectedTargetStage(propertyAdmission.issues);
  const elementAdmission = analyzeCsharpElementAdmission({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations,
    demand: nativeDemand, admitted: admittedControlNode, receivers: memberReceivers.records, navigation: source.navigation });
  if (elementAdmission.issues.length !== 0) return rejectedTargetStage(elementAdmission.issues);
  const typeParameterEmission = analyzeCsharpTypeParameterEmission({ ast: source.ast, nodes: sourceStorage.nodes,
    evidence: analysis.sourceEvidence, admitted: admittedControlNode });
  if (typeParameterEmission.issues.length !== 0) return rejectedTargetStage(typeParameterEmission.issues);
  const identifierIssues = analyzeCsharpIdentifierEmission({ ast: source.ast, nodes: sourceStorage.nodes, names,
    factories: classFactories, projects: projectEmission.records, parameters: typeParameterEmission.records,
    operations: admittedOperations, admitted: admittedControlNode });
  if (identifierIssues.length !== 0) return rejectedTargetStage(identifierIssues);
  const sourceUnions = analyzeCsharpSourceUnionEmission(typeDefinitions);
  const nativeLayouts = analyzeCsharpNativeMemoryEmission({ nodes: sourceStorage.nodes, storage: analysis.storage, operations: admittedOperations });
  const typeEmission = analyzeCsharpTypeEmission({ ast: source.ast, nodes: sourceStorage.nodes, evidence: analysis.sourceEvidence,
    languageDialect: configuration.languageDialect,
    extraTypes: [...nativeLayouts.carriers, ...nativeDemand.entries.flatMap(({ use }) => use.kind === "erased" ? []
      : use.kind === "converted" ? [use.carrier, use.target] : [use.carrier]),
      ...sourceUnions.sourceUnions.get().flatMap(union => [union.carrier, union.storage, ...union.arms])],
    values: analysis.valueReads, storage: analysis.storage, shapes: objectShapeDemand, admitted: admittedControlNode });
  if (typeEmission.issues.length !== 0) return rejectedTargetStage(typeEmission.issues);
  const nativeConstants = analyzeCsharpNativeConstants({ ast: source.ast, demand: nativeDemand, literals: literalValues,
    exact: exactLiterals, values: analysis.valueReads, types: typeEmission.records, references: sourceReferences.records });
  const binaryEmission = analyzeCsharpBinaryEmission({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    demand: nativeDemand, storage: analysis.storage, constants: nativeConstants, admitted: admittedControlNode });
  if (binaryEmission.issues.length !== 0) return rejectedTargetStage(binaryEmission.issues);
  const sourceFileEmission = analyzeCsharpSourceFileEmission({ source, identities: sourceOutputIdentities.records,
    factories: classFactories, evidence: analysis.sourceEvidence, operations: admittedOperations,
    moduleInitialization: moduleInitialization.index, expectedTypes: analysis.expectedTypes,
    declarations: callableDeclarations.records, names });
  if (sourceFileEmission.issues.length !== 0) return rejectedTargetStage(sourceFileEmission.issues);
  const binaryExecutionDriver = composeCsharpBinaryExecutionDriver(prerequisiteBinaryExecutionDriver,
    [...promiseResults.results.values()].some(result => result.discard !== undefined) ? csharpJsEventLoopBinaryExecutionDriver : undefined);
  const startup = analyzeCsharpStartup({ source, identities: sourceOutputIdentities.records, modules: moduleInitialization.index,
    constructions: sourceModuleConstructions.index, outputType: configuration.outputType, driver: binaryExecutionDriver });
  if (startup.issues.length !== 0) return rejectedTargetStage(startup.issues);
  const safetyEmission = analyzeCsharpSafetyEmission({ source, configuration, safety: safetyApplications,
    evidence: analysis.sourceEvidence, operations: admittedOperations, storage: analysis.storage,
    shapes: objectShapeDemand, unions: sourceUnions, admitted: admittedControlNode });
  if (safetyEmission.issues.length !== 0) return rejectedTargetStage(safetyEmission.issues);
  const sourceArtifacts = analyzeCsharpSourceArtifacts(source, sourceModuleConstructions.index);
  if (sourceArtifacts.issues.length !== 0) return rejectedTargetStage(sourceArtifacts.issues);
  const arrayLiterals = analyzeCsharpArrayLiterals({ source, demand: nativeDemand, conversions,
    values: analysis.valueReads, expected: analysis.expectedTypes, evidence: analysis.sourceEvidence, operations: admittedOperations });
  if (arrayLiterals.issues.length !== 0) return rejectedTargetStage(arrayLiterals.issues);
  const propertyValueProjection = analyzeCsharpPropertyValueProjection(conversions, callableAdapters.objectShapes, typeDefinitions);
  if (propertyValueProjection.issues.length !== 0) return rejectedTargetStage(propertyValueProjection.issues);
  const sourceCallEmission = analyzeCsharpSourceCallEmission({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    evidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions, admitted: admittedControlNode });
  if (sourceCallEmission.issues.length !== 0) return rejectedTargetStage(sourceCallEmission.issues);
  const targetArguments = analyzeCsharpTargetArguments({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations,
    sources: sourceCallEmission.records, demand: nativeDemand, admitted: admittedControlNode });
  if (targetArguments.issues.length !== 0) return rejectedTargetStage(targetArguments.issues);
  const argumentPassing = analyzeCsharpArgumentPassing({ source, requests: targetArguments.requests, nodes: sourceStorage.nodes,
    evidence: analysis.sourceEvidence, storage: analysis.storage, operations: admittedOperations,
    elements: elementAdmission.records, admitted: admittedControlNode });
  if (argumentPassing.issues.length !== 0) return rejectedTargetStage(argumentPassing.issues);
  const locationRetentionIssues = admitCsharpLocationRetention({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    storage: analysis.storage, elements: elementAdmission.records, arguments: argumentPassing.records, admitted: admittedControlNode });
  if (locationRetentionIssues.length !== 0) return rejectedTargetStage(locationRetentionIssues);
  const targetCallEmission = analyzeCsharpTargetCallEmission({ nodes: sourceStorage.nodes, admitted: admittedControlNode, operations: admittedOperations,
    arguments: targetArguments.records, sources: sourceCallEmission.records, optional: optionalCallChains.records,
    shapes: objectShapeDemand, demand: nativeDemand });
  if (targetCallEmission.issues.length !== 0) return rejectedTargetStage(targetCallEmission.issues);
  const constructionEmission = analyzeCsharpConstructionEmission({ source, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, values: analysis.valueReads, demand: nativeDemand, evidence: analysis.sourceEvidence,
    modules: sourceModuleConstructions.index.sourceModuleConstruction, files: sourceOutputIdentities.records, arguments: targetArguments.records });
  if (constructionEmission.issues.length !== 0) return rejectedTargetStage(constructionEmission.issues);
  const records = createCsharpProgramRecords({
    propertyValueProjection: propertyValueProjection.records,
    arrayLiterals: arrayLiterals.records,
    literalEmission: literalEmission.records,
    templateStrings,
    sourceArtifacts: sourceArtifacts.records,
    safetyEmission: safetyEmission.records,
    startup: startup.records,
    sourceFileEmission: sourceFileEmission.records,
    typeEmission: typeEmission.records,
    nativeConstants,
    binaryEmission: binaryEmission.records,
    nativeLayouts: nativeLayouts.records,
    typeParameterEmission: typeParameterEmission.records,
    projectEmission: projectEmission.records,
    captureMethods: captureMethods.records,
    frozenDataProperties: frozenDataProperties.records,
    indexedRecords: indexedRecords.records,
    objectLiterals: objectLiterals.records,
    objectMembers: objectMembers.records,
    objectMethods: objectMethods.records,
    structuralObjectEmission: structuralObjectEmission.records,
    compilation: Object.freeze({ project: project.value, namespace: project.value.namespace, languageDialect: configuration.languageDialect }),
    sourceUnions,
    objectShapeEmission: objectShapeEmission.records,
    objectShapes: createCsharpObjectShapeRecords(callableAdapters.objectShapes),
    sourceFiles: sourceOutputIdentities.records,
    bindingIdentities: analyzeCsharpBindingIdentities(source, sourceStorage.nodes),
    classEmission: classEmission.records,
    callableParameters: callableParameters.records,
    callableDeclarations: callableDeclarations.records,
    nativeMemberNames,
    methods: analyzeCsharpMethodEmission(source.ast, nativeMemberNames),
    classFields: analyzeCsharpClassFieldInitialization({ ast: source.ast, nodes: sourceStorage.nodes, storage: analysis.storage }),
    lexicalValues: lexicalValues.records,
    structuralInterfaces: analyzeCsharpStructuralInterfaceEmission({ ast: source.ast,
      shapes: callableAdapters.objectShapes, names, projectTypes, projections: analysis.typeProjections }),
    nativeDeclarations: analyzeCsharpNativeDeclarationForms({ ast: source.ast, nodes: sourceStorage.nodes, projectTypes, required: analysis.requiredRecords }),
    declarationModifiers: analyzeCsharpDeclarationModifiers({ ast: source.ast, nodes: sourceStorage.nodes,
      dispatch: callableAdapters.callableDispatch, helperAccess: captureStorage.helperAccess, required: analysis.requiredRecords, generators: generators.records, factories: classFactories.classFactory }),
    generators: generators.records,
    localBindings: analyzeCsharpLocalBindings({ ast: source.ast, navigation: source.navigation, nodes: sourceStorage.nodes,
      admitted: admittedControlNode, nativeRefs: admittedOperations.nativeRefReturn, storage: analysis.storage.storageType,
      moduleInitialization: moduleInitialization.index.moduleBindingInitialization, required: analysis.requiredRecords }),
    resourceScopes: analyzeCsharpResourceScopes({ ast: source.ast, nodes: sourceStorage.nodes,
      erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
        admittedOperations.nativeUnreachable.get(node) === true || nativeParticipation.participation.get(node) === "erased",
      required: analysis.requiredRecords }),
    statementCompletions,
    statementExits,
    objectShapeDemand,
    nativeValueCarriers,
    literalValues, exactLiterals, nativeParticipation, nativeDemand, bindingPatterns,
    unionEquality: unionEquality.records,
    closedTypeTests: closedTypeTests.records,
    jsValueBoxing: jsValueBoxing.records,
    unaryEmission: unaryEmission.records,
    thisEmission: thisEmission.records,
    sourceMemberNames: sourceMemberNames.records,
    receiverCallProperties: receiverCallProperties.records,
    restSequences: restSequences.records,
    jsCalls: jsCalls.records,
    callAdmission: callAdmission.records,
    propertyAdmission: propertyAdmission.records,
    optionalCallChains: optionalCallChains.records,
    elementAdmission: elementAdmission.records,
    sourceReferences: sourceReferences.records,
    memberReceivers: memberReceivers.records,
    sourceCallEmission: sourceCallEmission.records,
    targetArguments: targetArguments.records,
    argumentPassing: argumentPassing.records,
    targetCallEmission: targetCallEmission.records,
    constructionEmission: constructionEmission.records,
    typeofEmission: typeofEmission.records,
    flowReads, valueReads: analysis.valueReads,
    callableAdapters, callableCreations, typeProjections: analysis.typeProjections, classFactories, classInitialization, captureStorage,
    numericRepresentations, attributeApplications, safetyApplications, operations: admittedOperations,
    sourceEvidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions,
    expectedTypes: analysis.expectedTypes, storage: analysis.storage,
    sourceModuleConstructions: sourceModuleConstructions.index, moduleInitialization: moduleInitialization.index,
  }, analysis.requiredRecords);
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
    source: sourceSyntax,
    sourceNavigation: snapshotTargetPlanningSourceNavigation(source),
    sourceFiles,
    projectTypes,
    objectShapes: callableAdapters.objectShapes,
    names,
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
  const requiredRecords: CsharpRequiredRecord[] = [];
  const source = input.source;
  const names = createCsharpSourceNameBuilder(nameHost);
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
  const typeDefinitions = createCsharpTypeDefinitionRegistry(id => csharpProviderBindingFromResolution(providers.findTargetBindingByTargetId(id, "ordinary")));
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
    Object.freeze({ typeDefinitions: policy.typeDefinitions, projectTypes: policy.projectTypes,
      providers: policy.providers, target: policy.target, objectShapes }),
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
  const participation = analyzeCsharpNativeParticipation({
    ast: source.ast, storage: sourceStorage, navigation: source.navigation,
    captureClosure: captureStorage.captureClosure, lambdaCreation: captureStorage.lambdaCreation,
    objectShapes, compileTimeMetadata: sourceEvidence.compileTimeMetadata, requiredRecords,
  });
  if (participation.kind === "rejected") return participation;
  const nativeParticipation = participation.value;
  const classInitialization = analyzeCsharpClassInitialization(source, classFactories);
  const exactLiterals = analyzeCsharpExactLiteralSelections(typeHost.literalValues, [
    ...preparedConversions.exactLiteralRequests,
    ...expectedTypes.constructions.propertyKeyRequests,
    ...expectedTypes.nativeUseSites.requests.flatMap(request => request.kind === "requested"
      ? [{ expression: request.expression, target: request.targetType }] : []),
  ]);
  const bindingCandidates = analyzeCsharpBindingPatterns({
    ast: source.ast, semanticsFor: source.semantics.forNode, sourceFiles, participation: nativeParticipation.participation,
    evidence: sourceEvidence, operations, valueReads, objectShapes,
    typePolicy: policy.types, conversionPolicy: Object.freeze({ ...policy, objectShapes }), storage: storageRepresentations,
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
    nativeExpressionIssues: evidence.nativeExpressionIssues,
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
    nativeExpressionIssues: evidence.nativeExpressionIssues,
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
    nativeParticipation,
    classInitialization,
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
