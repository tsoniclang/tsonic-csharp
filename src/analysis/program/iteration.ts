import type { CsharpRepresentationAnalysis, CsharpRepresentationContract } from "./model.js";
import { rejectCsharpAnalysisIssues } from "./issues.js";
import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { SourceFile } from "@tsonic/tsts";
import { analyzeCsharpCaptureStorage } from "../callables/storage/capture-storage.js";

import { analyzeCsharpNativeParticipation } from "../callables/calls/participation.js";

import { analyzeCsharpClassFactories } from "../project-types/class-factories.js";
import { analyzeCsharpClassInitialization } from "../project-types/class-initialization.js";

import type { CsharpRequiredRecord } from "./records/objects/required-records.js";
import { analyzeCsharpExactLiteralSelections } from "../conversions/literal-plans.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";

import { analyzeCsharpTypeProjections, csharpTypeProjectionIndexesEqual } from "../declarations/type-projections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";

import type { CsharpExpectedNativeUse } from "../../target-model/records/native/native-demand.js";

import { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import { createCsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";

import { failTargetAnalysisInvariant, rejectedTargetStage, resolvedTargetStage } from "@tsonic/target-api/artifacts";
import type { TargetStageResult } from "@tsonic/target-api/artifacts";

import { createCsharpTypeAnalysis } from "./type-system.js";
import type { CsharpTypeSystemHost } from "./type-system.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { createCsharpNativeValueQuery } from "./native-values.js";
import { analyzeCsharpAttributeApplications } from "../attributes/application-index.js";

import type { CsharpTargetAnalysisRequest } from "./model.js";
import { createCsharpSourceIdentityPolicy } from "../../source/extension/identities.js";
import { analyzeCsharpTargetOperations } from "../operations/index.js";
import { createCsharpAnalysisPolicyContext } from "./policy-context.js";
import { analyzeCsharpSourceEvidence } from "../source-evidence/index.js";
import { analyzeCsharpDeclarations } from "../declarations/index.js";
import { createCsharpSourceNameBuilder } from "../names/index.js";
import { analyzeCsharpCallableContracts, csharpCallableContractIndexesEqual } from "../callables/index.js";
import { analyzeCsharpObjectShapes } from "../objects/index.js";
import { analyzeCsharpConversions } from "../conversions/index.js";

import { analyzeCsharpExpectedTypes } from "../expected-types/index.js";
import { analyzeCsharpStorage, prepareCsharpStorage, sealCsharpStorage } from "../storage/index.js";
import { csharpStorageClassificationsEqual } from "../storage/contracts.js";

import { type SourceStorageQueries } from "@tsonic/target-api/analysis";

import { analyzeCsharpRefLikePlacements } from "../storage/native-placement.js";
import { analyzeCsharpCallableCreations } from "../callables/values/creation.js";
import { analyzeCsharpBindingPatterns, admitCsharpBindingPatterns } from "../control-flow/binding-patterns.js";
import { admitCsharpExpectedNativeUses } from "../expected-types/native-uses.js";
import { analyzeCsharpNativeDemand } from "../operations/native-demand.js";

import { analyzeCsharpValueReadStages } from "../conversions/value-read-stages.js";
import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";
import { analyzeCsharpOptionalLocals } from "../storage/optional-locals.js";

export interface CsharpRepresentationIterationHost extends Omit<CsharpTypeSystemHost, "typeDefinitions" | "nativeValue"> {
  readonly moduleCallables: CsharpPolicyContext["moduleCallables"];
  readonly literals: CsharpPolicyContext["literals"];
  readonly callOnlyAlias: CsharpPolicyContext["callOnlyAlias"];
}

export function analyzeCsharpRepresentationIteration(
  input: CsharpTargetAnalysisRequest["input"],
  providers: CsharpTargetAnalysisRequest["providers"],
  sourceFiles: readonly SourceFile[],
  sourceIdentities: ReturnType<typeof createCsharpSourceIdentityPolicy>,
  nameHost: Parameters<typeof createCsharpSourceNameBuilder>[0],
  typeHost: CsharpRepresentationIterationHost,
  sourceStorage: SourceStorageQueries,
  statementErasure: Parameters<typeof analyzeCsharpTargetOperations>[2],
  previous: CsharpRepresentationContract | undefined,
): TargetStageResult<CsharpRepresentationAnalysis> {
  const requiredRecords: CsharpRequiredRecord[] = [];
  const source = input.source;
  const names = createCsharpSourceNameBuilder(nameHost);
  let completedPolicy: CsharpPolicyContext | undefined;
  const nativeValue = createCsharpNativeValueQuery(source, () => completedPolicy ?? failTargetAnalysisInvariant(
    "tsonic-csharp", "Native value production requires the identical initialized representation policy."), previous);
  const typeDefinitions = createCsharpTypeDefinitionRegistry(id => csharpProviderBindingFromResolution(providers.findTargetBindingByTargetId(id, "ordinary")));
  const typeSystem = createCsharpTypeAnalysis(
    { ...typeHost, typeDefinitions, nativeValue },
    createCsharpProjectTypeCatalog({ ast: source.ast, facts: source.facts }, previous?.typeProjections),
  );
  const policy = createCsharpAnalysisPolicyContext({
    moduleCallables: typeHost.moduleCallables,
    literals: typeHost.literals,
    callOnlyAlias: typeHost.callOnlyAlias,
    input,
    sourceFiles,
    sourceStorage,
    providers,
    sourceIdentities,
    typeSystem,
  });
  completedPolicy = policy;
  const evidence = analyzeCsharpSourceEvidence(
    input.source,
    sourceFiles,
    typeSystem.analysisTypes,
    policy,
    typeHost.pointerStorage,
  );
  const sourceEvidence = evidence.index;
  if (sourceEvidence.fixedArrayIssues.length > 0) return rejectCsharpAnalysisIssues(sourceEvidence.fixedArrayIssues);
  const operations = analyzeCsharpTargetOperations(policy, sourceEvidence, statementErasure, sourceStorage.nodes, requiredRecords);
  const valueReadStages = analyzeCsharpValueReadStages(policy, sourceEvidence, operations);
  if (valueReadStages.issues.length > 0) return rejectCsharpAnalysisIssues(valueReadStages.issues);
  const optionalLocals = analyzeCsharpOptionalLocals(policy, sourceEvidence, sourceStorage.nodes, names, operations);
  const typeProjections = analyzeCsharpTypeProjections(input.source, sourceEvidence, operations, optionalLocals);
  const declarations = analyzeCsharpDeclarations(
    policy,
    sourceEvidence,
    operations,
  );
  const objectShapes = analyzeCsharpObjectShapes(policy, sourceEvidence, operations);
  const conversionAnalysis = analyzeCsharpConversions(
    policy,
    sourceEvidence,
    objectShapes,
    operations,
  );
  const callableResult = analyzeCsharpCallableContracts(
    policy,
    sourceEvidence,
    declarations,
    names,
    typeProjections,
    input.source,
    Object.freeze({ typeDefinitions: policy.typeDefinitions, projectTypes: policy.projectTypes,
      providers: policy.providers, target: policy.target, objectShapes, conversion: conversionAnalysis.classifications.conversion }),
    operations,
  );
  if (callableResult.kind === "rejected") return callableResult;
  const callables = callableResult.value;
  const expectedTypes = analyzeCsharpExpectedTypes(
    policy,
    sourceEvidence,
    operations,
    objectShapes,
    callables,
    valueReadStages.valueReadStages,
    declarations,
    typeProjections,
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
    expectedTypes,
    valueReads,
  });
  const backingEvidence = Object.freeze({ ...sourceEvidence, inspectClosedArrayStorage: evidence.inspectClosedArrayStorage });
  const storagePreparation = prepareCsharpStorage(policy, backingEvidence, operations, storageRepresentations, valueReads.valueRead);
  const classFactories = analyzeCsharpClassFactories(source, typeSystem.projectTypes.catalog, sourceEvidence,
    storagePreparation.captures, names, operations, requiredRecords);
  const captureStorage = analyzeCsharpCaptureStorage(source, objectShapes, storagePreparation.captures, sourceEvidence,
    classFactories.factories.flatMap(factory => factory.captures), callables, operations.erasedStatement, operations);
  const callableCreationResult = analyzeCsharpCallableCreations({
    source, nodes: sourceStorage.nodes, captures: captureStorage, contracts: callables,
    operations, storage: storageRepresentations, expectedTypes, evidence: sourceEvidence, conversions: preparedConversions,
    literals: typeHost.literals,
  });
  if (callableCreationResult.kind === "rejected") return callableCreationResult;
  const callableCreations = callableCreationResult.value;
  expectedTypes.completeReturns(callableCreations.callableCreation);
  const participation = analyzeCsharpNativeParticipation({
    ast: source.ast, storage: sourceStorage, navigation: source.facts.navigation,
    captureClosure: captureStorage.captureClosure, callableCreation: callableCreations.callableCreation,
    compileTimeMetadata: sourceEvidence.compileTimeMetadata, requiredRecords,
  });
  if (participation.kind === "rejected") return participation;
  const nativeParticipation = participation.value;
  const classInitialization = analyzeCsharpClassInitialization(source, classFactories);
  const literalSelections = analyzeCsharpExactLiteralSelections(typeHost.literals, [
    ...preparedConversions.exactLiteralRequests,
    ...expectedTypes.constructions.propertyKeyRequests,
    ...expectedTypes.nativeUseSites.requests.flatMap(request => request.kind === "requested"
      ? [{ expression: request.expression, source: valueReads.valueRead.get(request.expression)?.value, target: request.targetType }] : []),
  ], sourceStorage.nodes);
  if (literalSelections.kind !== "represented") return rejectedTargetStage([csharpRepresentationDiagnostic(literalSelections)]);
  const exactLiterals = literalSelections.value;
  const expectedUse = admitCsharpExpectedNativeUses(expectedTypes, {
    ast: source.ast, exactLiteral: exactLiterals.exactLiteral, callableCreation: callableCreations.callableCreation,
    valueRead: valueReads.valueRead, operations,
  });
  const initializerUses = new Map<object, CsharpExpectedNativeUse | null>();
  for (const entry of expectedUse.entries) if (entry.site.role === "initializer")
    initializerUses.set(entry.site.subject, initializerUses.has(entry.site.subject) ? null : entry.use);
  const bindingCandidates = analyzeCsharpBindingPatterns({
    ast: source.ast, effectiveTypes: source.effectiveTypes, sourceFacts: policy.sourceFacts, semanticsFor: source.semantics.forNode, sourceFiles, participation: nativeParticipation.participation,
    evidence: sourceEvidence, operations, valueReads, objectShapes, initializerUses,
    typePolicy: policy.types, conversionPolicy: Object.freeze({ ...policy, objectShapes }), storage: storageRepresentations,
  });
  const pendingInitializers = new Set(expectedUse.pending.filter(entry => entry.site.role === "initializer")
    .map(entry => entry.site.subject));
  for (const declaration of sourceStorage.nodes) {
    if (!source.ast.is.IsVariableDeclaration(declaration) || source.ast.variableDeclarationKind(declaration) !== "const") continue;
    const list = source.ast.parent(declaration);
    const statement = list === undefined ? undefined : source.ast.parent(list);
    const parent = statement === undefined ? undefined : source.ast.parent(statement);
    if (list === undefined || !source.ast.is.IsVariableDeclarationList(list) || statement === undefined ||
      !source.ast.is.IsVariableStatement(statement) || parent === undefined || !source.ast.is.IsSourceFile(parent) ||
      pendingInitializers.has(declaration)) continue;
    const summary = source.facts.navigation.declarationUseSummary(declaration);
    const typeOnly = !summary.exported && !summary.bindingWritten && !summary.memberWritten &&
      !summary.captured && summary.escapeKinds.length === 0 && summary.uses.length !== 0 &&
      summary.uses.every(use => use.kind === "type-only" && use.role === "type-only" && !use.captured && !use.throughMember);
    if (!typeOnly) continue;
    const initializer = source.ast.as.AsVariableDeclaration(declaration)?.Initializer;
    let use = initializerUses.get(declaration);
    if (initializer === undefined || use == null || use.expression !== initializer) continue;
    const effects = source.facts.navigation.expressionEffects(initializer);
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
    const literalResult = typeHost.literals.recipe(use.expression);
    if (literalResult.kind !== "represented") return rejectedTargetStage([csharpRepresentationDiagnostic(literalResult)]);
    if (literalResult.value.kind === "none") continue;
    const literal = literalResult.value.value;
    const selected = exactLiterals.exactLiteral.get(use.expression, target);
    if (selected?.kind === "resolved" && use.representation === "construct" && use.literal === selected.recipe &&
      target.kind === "source-primitive" && (selected.recipe.kind !== "char" || !/[\uD800-\uDFFF]/u.test(selected.recipe.value))) {
      evidence.eraseCompileTimeDeclaration(declaration);
    } else if (selected?.kind === "source-representation" && use.representation === "forward" &&
      (literal.kind === "string" && isCsharpStringTargetType(target) && !/[\uD800-\uDFFF]/u.test(literal.value) ||
        literal.kind === "boolean" && target.kind === "source-primitive" && target.name === "bool" ||
        literal.kind === "number" && target.kind === "source-primitive" && target.name === "float64")) {
      evidence.eraseCompileTimeDeclaration(declaration);
    }
  }
  evidence.sealCompileTimeDeclarations();
  const nativeDemand = analyzeCsharpNativeDemand({
    facts: source.facts, ast: source.ast, sourceFiles, navigation: source.facts.navigation, evidence: sourceEvidence,
    operations, valueReads, optionalLocals, participation: nativeParticipation.participation, declarations, objectShapes,
    bindingPatterns: bindingCandidates, callableCreation: callableCreations.callableCreation, attributeApplications: attributes.index,
    propertyKeyBindings: expectedTypes.constructions.propertyKeys, exactLiteral: exactLiterals.exactLiteral,
    classInitialization, projectTypes: typeSystem.projectTypes.catalog, classFactories, expected: expectedUse,
    nativeExpressionIssues: evidence.nativeExpressionIssues, sourceStorage,
  }, requiredRecords);
  const requiredSourceRefusals = nativeDemand.unadmitted.flatMap(use =>
    use.kind === "source-refusal" ? [use.diagnostic] : []);
  if (requiredSourceRefusals.length !== 0) return rejectedTargetStage<never>(requiredSourceRefusals);
  const bindingPatterns = admitCsharpBindingPatterns(bindingCandidates, nativeDemand.requiredBindingRoots, requiredRecords);
  const flowReads = analyzeCsharpFlowReadProjections({ ...policy, objectShapes }, sourceEvidence, operations, valueReads);
  conversionAnalysis.close(nativeDemand, requiredRecords, captureStorage, callableCreations, flowReads);
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
    optionalLocals,
    valueReads,
    valueReadStages: valueReadStages.valueReadStages,
    flowReads,
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

export function representationContractsEqual(
  left: CsharpRepresentationContract,
  right: CsharpRepresentationContract,
): boolean {
  return csharpCallableContractIndexesEqual(left.callables, right.callables) &&
    csharpStorageClassificationsEqual(left.storage, right.storage) &&
    csharpTypeProjectionIndexesEqual(left.typeProjections, right.typeProjections);
}
