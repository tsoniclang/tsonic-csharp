import { rejectCsharpAnalysisIssues } from "./issues.js";
import { csharpCallableImplementation } from "../callables/implementation.js";
import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { analyzeCsharpCaptureStorage } from "../callables/storage/capture-storage.js";

import { analyzeCsharpNativeParticipation } from "../callables/calls/participation.js";

import { analyzeCsharpClassFactories } from "../project-types/class-factories.js";
import { analyzeCsharpClassInitialization } from "../project-types/class-initialization.js";

import type { CsharpRequiredRecord } from "./records/objects/required-records.js";
import { sourceCallableValueExpression, type SourceProgramFacts } from "@tsonic/target-api/source";
import { sourceCallSelection } from "./source-facts.js";
import { analyzeCsharpExactLiteralSelections } from "../conversions/literal-plans.js";

import { analyzeCsharpTypeProjections, csharpTypeProjectionIndexesEqual } from "../declarations/type-projections.js";
import { type CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import { csharpCallableValueType } from "../../policy/types/callables/value-type.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";

import type { CsharpExpectedNativeUse } from "../../target-model/records/native/native-demand.js";

import { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import { createCsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";

import { rejectedTargetStage, resolvedTargetStage } from "@tsonic/target-api/artifacts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

import { createCsharpTypeAnalysis } from "./type-system.js";
import type { CsharpTypeAnalysis } from "./type-system.js";
import type { CsharpPlanningRepresentationQueries } from "./type-system.js";
import { analyzeCsharpAttributeApplications } from "../attributes/application-index.js";

import type { CsharpTargetAnalysisRequest } from "./model.js";
import { createCsharpSourceIdentityPolicy } from "../../source/extension/identities.js";
import { analyzeCsharpTargetOperations } from "../operations/index.js";
import { createCsharpAnalysisPolicyContext } from "./policy-context.js";
import { analyzeCsharpSourceEvidence } from "../source-evidence/index.js";
import { analyzeCsharpDeclarations } from "../declarations/index.js";
import { createCsharpSourceNameBuilder } from "../names/index.js";
import { analyzeCsharpCallableContracts, csharpCallableContractIndexesEqual } from "../callables/index.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callables/callable-values.js";
import { analyzeCsharpObjectShapes } from "../objects/index.js";
import { analyzeCsharpConversions } from "../conversions/index.js";

import { analyzeCsharpExpectedTypes } from "../expected-types/index.js";
import { analyzeCsharpStorage, prepareCsharpStorage, sealCsharpStorage } from "../storage/index.js";
import { csharpStorageClassificationsEqual } from "../storage/contracts.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";

import { type SourceStorageQueries } from "@tsonic/target-api/analysis";

import { analyzeCsharpRefLikePlacements } from "../storage/native-placement.js";
import { analyzeCsharpCallableCreations } from "../callables/values/creation.js";
import { analyzeCsharpBindingPatterns, admitCsharpBindingPatterns } from "../control-flow/binding-patterns.js";
import { admitCsharpExpectedNativeUses } from "../expected-types/native-uses.js";
import { analyzeCsharpNativeDemand } from "../operations/native-demand.js";

import { analyzeCsharpValueReadStages } from "../conversions/value-read-stages.js";
import { analyzeCsharpOptionalLocals } from "../storage/optional-locals.js";

export interface CsharpRepresentationContract {
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callables: CsharpCallableContractIndex;
  readonly storage: CsharpStorageClassifications;
}

export function analyzeCsharpRepresentationIteration(
  input: CsharpTargetAnalysisRequest["input"],
  providers: CsharpTargetAnalysisRequest["providers"],
  sourceFiles: readonly SourceFile[],
  sourceIdentities: ReturnType<typeof createCsharpSourceIdentityPolicy>,
  nameHost: Parameters<typeof createCsharpSourceNameBuilder>[0],
  typeHost: Parameters<typeof createCsharpTypeAnalysis>[0],
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
      const moduleSource = typeHost.moduleCallables.get(node);
      if (moduleSource !== undefined) {
        const moduleCallable = moduleSource.callable;
        const moduleOwner = moduleSource.sourceOwner;
        const annotation = source.syntax.typeNode(moduleOwner);
        if (annotation !== undefined && typeSystem?.analysisTypes.storage(moduleOwner).kind === "csharp-refused") return undefined;
        const callable = previous?.callables.get({ kind: "declaration", declaration: moduleCallable });
        return callable === undefined ? undefined : csharpCallableValueType(callable);
      }
      if (source.syntax.is.IsArrowFunction(node) || source.syntax.is.IsFunctionExpression(node)) {
        const selected = previous?.callables.closedInputType(node);
        if (selected !== undefined) return selected;
      }
      const storage = previous?.storage.requiredStorageType.get(node);
      if (storage !== undefined) return storage;
      if (!input.source.syntax.is.IsArrowFunction(node) && !input.source.syntax.is.IsFunctionExpression(node) &&
        !input.source.syntax.is.IsFunctionDeclaration(node)) return undefined;
      const callable = previous?.callables.get({ kind: "declaration", declaration: node });
      return callable === undefined ? undefined : csharpCallableValueType(callable);
    },
    closedInputContract(node) {
      const value = sourceCallableValueExpression(source.syntax, node, { typeAssertions: "transparent" });
      if (value === undefined) return undefined;
      const declaration = source.facts.navigation.identity.target(value)?.declaration ?? value;
      return previous?.callables.closedInputContract(declaration);
    },
    sourceCallable(use, selection) {
      return sourceCallableContract(
        input,
        typeHost.moduleCallables,
        use,
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
    moduleCallables: typeHost.moduleCallables,
    integerRanges: typeHost.integerRanges,
    callOnlyAlias: typeHost.callOnlyAlias,
    input,
    sourceFiles,
    sourceStorage,
    pointerStorage: typeHost.pointerStorage,
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
    classFactories.factories.flatMap(factory => factory.captures), callables, operations.erasedStatement, operations,
    typeSystem.representation.typeParameters);
  const callableCreationResult = analyzeCsharpCallableCreations({
    source, nodes: sourceStorage.nodes, captures: captureStorage, contracts: callables,
    operations, storage: storageRepresentations, expectedTypes, evidence: sourceEvidence, conversions: preparedConversions,
  });
  if (callableCreationResult.kind === "rejected") return callableCreationResult;
  const callableCreations = callableCreationResult.value;
  expectedTypes.completeReturns(callableCreations.callableCreation);
  const participation = analyzeCsharpNativeParticipation({
    ast: source.syntax, storage: sourceStorage, facts: source.facts,
    captureClosure: captureStorage.captureClosure, callableCreation: callableCreations.callableCreation,
    compileTimeMetadata: sourceEvidence.compileTimeMetadata, requiredRecords,
  });
  if (participation.kind === "rejected") return participation;
  const nativeParticipation = participation.value;
  const classInitialization = analyzeCsharpClassInitialization(source, classFactories);
  const exactLiterals = analyzeCsharpExactLiteralSelections(source.facts, [
    ...preparedConversions.exactLiteralRequests,
    ...expectedTypes.constructions.propertyKeyRequests,
    ...expectedTypes.nativeUseSites.requests.flatMap(request => request.kind === "requested"
      ? [{ expression: request.expression, source: valueReads.valueRead.get(request.expression)?.value, target: request.targetType }] : []),
  ], sourceStorage.nodes);
  const expectedUse = admitCsharpExpectedNativeUses(expectedTypes, {
    ast: source.syntax, exactLiteral: exactLiterals.exactLiteral, callableCreation: callableCreations.callableCreation,
    valueRead: valueReads.valueRead, operations,
  });
  const initializerUses = new Map<object, CsharpExpectedNativeUse | null>();
  for (const entry of expectedUse.entries) if (entry.site.role === "initializer")
    initializerUses.set(entry.site.subject, initializerUses.has(entry.site.subject) ? null : entry.use);
  const bindingCandidates = analyzeCsharpBindingPatterns({
    ast: source.syntax, facts: source.facts, sourceFacts: policy.sourceFacts, sourceFiles, participation: nativeParticipation.participation,
    evidence: sourceEvidence, operations, valueReads, objectShapes, initializerUses,
    typePolicy: policy.types, conversionPolicy: Object.freeze({ ...policy, objectShapes }), storage: storageRepresentations,
  });
  const pendingInitializers = new Set(expectedUse.pending.filter(entry => entry.site.role === "initializer")
    .map(entry => entry.site.subject));
  for (const declaration of sourceStorage.nodes) {
    if (!source.syntax.is.IsVariableDeclaration(declaration) || source.syntax.variableDeclarationKind(declaration) !== "const" ||
      !source.facts.navigation.scopes.isModuleScoped(declaration) || pendingInitializers.has(declaration) ||
      !source.facts.navigation.uses.hasOnlyTypeUses(declaration)) continue;
    const initializer = source.syntax.as.AsVariableDeclaration(declaration)?.Initializer;
    let use = initializerUses.get(declaration);
    if (initializer === undefined || use == null || use.expression !== initializer) continue;
    const effects = source.facts.navigation.expressions.effects(initializer);
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
    const literal = source.facts.values.literal(use.expression);
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
    ast: source.syntax, sourceFiles, facts: source.facts, evidence: sourceEvidence,
    operations, valueReads, optionalLocals, participation: nativeParticipation.participation, declarations, objectShapes,
    bindingPatterns: bindingCandidates, callableCreation: callableCreations.callableCreation, attributeApplications: attributes.index,
    propertyKeyBindings: expectedTypes.constructions.propertyKeys, exactLiteral: exactLiterals.exactLiteral,
    classInitialization, projectTypes: typeSystem.projectTypes.catalog, classFactories, expected: expectedUse,
    nativeExpressionIssues: evidence.nativeExpressionIssues, sourceStorage,
  }, requiredRecords);
  const sourceResolutionIssues = new Set<TargetDiagnostic>(evidence.nativeExpressionIssues);
  const requiredSourceRefusals = nativeDemand.unadmitted.flatMap(use =>
    use.kind === "source-refusal" && sourceResolutionIssues.has(use.diagnostic) ? [use.diagnostic] : []);
  if (requiredSourceRefusals.length !== 0) return rejectedTargetStage<never>(requiredSourceRefusals);
  const bindingPatterns = admitCsharpBindingPatterns(bindingCandidates, nativeDemand.requiredBindingRoots, requiredRecords);
  conversionAnalysis.close(nativeDemand, requiredRecords, captureStorage, callableCreations);
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

/**
 * The implementation of a selected project signature. A signature with a body is its own implementation; a non-project
 * signature has no project implementation. A bodyless project signature (an overload) needs the Host's
 * signature-to-implementation fact, which SourceProgramFacts does not publish yet (request R-E1-1:
 * `objects.callableImplementation(contract): Node | "unrelated" | SourceRefusal`, D1 R-B1 / R-F4-2).
 */
function callableImplementation(facts: SourceProgramFacts, signature: Node): Node {
  // The Host implementation of the selected signature; "unrelated" keeps the signature itself (baseline behaviour).
  const implementation = csharpCallableImplementation(facts, signature);
  return implementation === "unrelated" ? signature : implementation;
}

/**
 * The callable contract a source call reaches: the selected declaration from the Host call selection, or with
 * "implementation" the implementation of the selected signature (callableImplementation).
 */
function sourceCallableContract(
  input: CsharpTargetAnalysisRequest["input"],
  moduleCallables: import("../../target-model/records/callables/module-callables.js").CsharpModuleCallableIdentities,
  use: Node,
  typeSystem: CsharpTypeAnalysis | undefined,
  callables: CsharpCallableContractIndex | undefined,
  selection: "checked" | "implementation",
) {
  if (callables === undefined) return undefined;
  const facts = input.source.facts;
  const call = sourceCallSelection(facts, use);
  if (selection === "implementation") {
    const declaration = facts.navigation.identity.target(call.callee)?.declaration ?? call.declaration;
    const initializer = declaration === undefined ? undefined : moduleCallables.get(declaration)?.callable;
    if (initializer !== undefined) {
      const selected = call.declaration;
      if (selected === undefined || selected !== declaration && selected !== initializer ||
        !facts.navigation.identity.isProjectDeclaration(selected)) return undefined;
      return callables.get({ kind: "declaration", declaration: initializer });
    }
  }
  if (call.declaration !== undefined && input.source.syntax.is.IsClassDeclaration(call.declaration)) {
    const constructor = typeSystem?.projectTypes.implicitConstructorForSignature(call.declaration, call.signature,
      call.parameters.map(parameter => parameter.type));
    if (constructor !== undefined) {
      return callables.get({ kind: "project-constructor", targetMemberId: constructor.targetMember.id });
    }
  }
  const declaration = selection === "implementation" ? callableImplementation(facts, call.signature) : call.signature;
  return declaration !== undefined && facts.navigation.identity.isProjectDeclaration(declaration)
    ? callables.get({ kind: "declaration", declaration })
    : undefined;
}

export function representationContractsEqual(
  left: CsharpRepresentationContract,
  right: CsharpRepresentationContract,
): boolean {
  return csharpCallableContractIndexesEqual(left.callables, right.callables) &&
    csharpStorageClassificationsEqual(left.storage, right.storage) &&
    csharpTypeProjectionIndexesEqual(left.typeProjections, right.typeProjections);
}

export type CsharpRepresentationAnalysis = Extract<ReturnType<typeof analyzeCsharpRepresentationIteration>, { readonly kind: "resolved" }>["value"];
