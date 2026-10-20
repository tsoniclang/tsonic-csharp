import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpConversion, selectCsharpExpressionConversion } from "../../policy/conversions/index.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpTargetBindingFact, isCsharpReferenceCarrier, targetTypeRefKey, targetTypeRefEquals } from "../../policy/types/index.js";
import { isSourceOwnedCallableRuntimeCarrierSubject, isSourceOwnedProjectReference } from "../types/resolution/source-ownership.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpClosedShapeMemberProjection } from "../../target-model/records/closed-object-shapes.js";

import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpStructuralInterfaceRegistration } from "../objects/structural-interfaces.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";

import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpConversionAnalysis, CsharpPreparedConversionClassifications } from "./model.js";
import type { CsharpConversionClassifications, CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/conversions.js";
import { sealCsharpDelegateAdapterIdentities } from "./delegate-identities.js";

import { selectCsharpIntegerTruncationConversion } from "./integer-truncation.js";
import { selectCsharpExactIntegerConversion } from "../../policy/conversions/exact-integer.js";
import { admitCsharpConversionSelection } from "./validation.js";

import { createCsharpExactLiteralRequestCollector } from "./literal-requests.js";
import { sealCsharpConversionUses, type CsharpCallConversionRequests } from "./use-admission.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native-demand.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { collectCsharpGeneratedHelpers } from "./generated-helpers.js";
import { createCsharpGeneratedHelperRecords } from "../program/records/generated-helpers.js";
import type { CsharpGeneratedHelper } from "../../target-model/records/generated-helpers.js";
import { createCsharpDelegateContractProducer } from "../program/records/callable-conversions.js";
import { admitCsharpDelegateEmission, admitCsharpDelegateOperand } from "./callable-emission.js";

const maximumConversionClassifications = 1_048_576;

export function analyzeCsharpConversions(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  objectShapes: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration,
): CsharpConversionAnalysis {
  const pairSelections = new Map<string, CsharpConversionSelection>();
  const delegateContracts = createCsharpDelegateContractProducer();
  const expressionSelections = new Map<
    Node,
    Map<string, CsharpExpressionConversionClassification>
  >();
  const callConversions = new Map<Node, CsharpCallConversionRequests>();
  let delegateAdapters: ReturnType<typeof sealCsharpDelegateAdapterIdentities> = new Map();
  const issues: CsharpConversionIssue[] = [];
  const propertyProjections = new WeakMap<Node, ReadonlyMap<string, readonly CsharpClosedShapeMemberProjection[]>>();
  const propertyProjectionRoots = new Map<Node, Map<string, TargetTypeRef>>();
  const directCallables = new WeakMap<Node, NonNullable<ReturnType<CsharpPolicyContext["navigation"]["referenceFor"]>>>();
  let classificationCount = 0;
  let closed = false;
  let preparedClassifications: CsharpPreparedConversionClassifications | undefined;
  let preparedOperations: CsharpTargetOperationClassifications | undefined;
  let preparedValueReads: CsharpValueReadClassifications | undefined;
  let sealedClassifications: CsharpConversionClassifications | undefined;
  const requiredHelpers = new Set<CsharpGeneratedHelper>();
  const literalRequests = createCsharpExactLiteralRequestCollector(policy.literalValues);
  const conversionPolicy = Object.freeze({
    ast: policy.ast, literalValues: policy.literalValues, typeDefinitions: policy.typeDefinitions,
    projectTypes: policy.projectTypes, providers: policy.providers, target: policy.target,
    navigation: policy.navigation, sourceFacts: policy.sourceFacts, objectShapes,
  });

  const openClassifications: CsharpConversionClassifications = {
    ...delegateContracts.records,
    get propertyProjectionRoots() { return Object.freeze([...propertyProjectionRoots].flatMap(([node, types]) =>
      [...types.values()].map(carrier => Object.freeze({ node, carrier })))); },
    generatedHelpers: Object.freeze({ get: () => Object.freeze([...requiredHelpers].sort()) }),
    generatedHelper: Object.freeze({ get: (helper: CsharpGeneratedHelper) => requiredHelpers.has(helper) ? true : undefined }),
    issues,
    propertyProjection: Object.freeze({ get: (expression, source) => propertyProjections.get(expression)?.get(targetTypeRefKey(source)) }),
    delegateAdapters: Object.freeze({ get: scope => delegateAdapters.get(scope) ?? [] }),
    delegateAdapter: Object.freeze({ get: (expression, source, target) => expressionSelections.get(expression)?.get(csharpConversionKey(source, target, "implicit"))?.delegateIdentity }),
    directCallableReference: Object.freeze({ get: expression => directCallables.get(expression) }),
    conversion: Object.freeze({ get(source, target, mode) {
      if (source === undefined || target === undefined) {
        return csharpUnavailableConversion;
      }
      const key = csharpConversionKey(source, target, mode);
      const selected = pairSelections.get(key);
      return selected ?? (
          closed
            ? undefined
            : classifyPair(source, target, mode, policy.sourceFiles[0])
        );
    } }),
    expressionConversion: Object.freeze({ get(expression, source, target, mode) {
      if (source === undefined || target === undefined) {
        return csharpUnavailableConversion;
      }
      const key = csharpConversionKey(source, target, mode);
      const selected = expressionSelections.get(expression)?.get(key)?.selection;
      return selected ?? (
          closed
            ? undefined
            : classifyExpression(expression, source, target, mode)
        );
    } }),
  };
  const classifications = Object.freeze(openClassifications);

  const analysis: CsharpConversionAnalysis = {
    classifications,
    prepare({ operations, expectedTypes, valueReads }) {
      if (preparedClassifications !== undefined) return preparedClassifications;
      preparedOperations = operations;
      preparedValueReads = valueReads;
      collectCsharpConversionRequirements({ policy, evidence, objectShapes, operations, expectedTypes, valueReads,
        literalRequests, classifyPair, classifyExpression, reserveClassification, issues, propertyProjectionRoots,
        propertyProjections, callConversions });
      preparedClassifications = Object.freeze({ ...classifications, exactLiteralRequests: literalRequests.seal() });
      return preparedClassifications;
    },
    close(nativeDemand, requiredRecords, captures) {
      if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Native conversion preparation closes exactly once.");
      if (preparedClassifications === undefined || preparedOperations === undefined || preparedValueReads === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Native conversion uses require completed preparation.");
      const admitted = sealCsharpConversionUses(nativeDemand, preparedOperations, (expression, source, target, mode, exactInteger, boundary, sourceCompletion) => {
        const selected = boundary === undefined ? classifyExpression(expression, source, target, mode, exactInteger, sourceCompletion) : boundary.selection;
        if (selected === undefined) return undefined;
        admitCsharpDelegateEmission(delegateContracts, source, target, selected);
        issues.push(...admitCsharpDelegateOperand(policy.ast, captures, delegateContracts, expression, source, target, selected));
        collectCsharpGeneratedHelpers(selected, requiredHelpers);
        if (boundary === undefined && sourceCompletion?.kind !== "void") classifyPair(source, target, mode, expression);
        const key = csharpConversionKey(source, target, mode);
        if (boundary !== undefined) {
          const selections = expressionSelections.get(expression) ?? new Map();
          selections.set(key, Object.freeze({ source, target, selection: selected,
            ...(boundary.identityRequired === true ? { identityRequired: true } : {}) }));
          expressionSelections.set(expression, selections);
        }
        const classification = expressionSelections.get(expression)?.get(key);
        return classification === undefined ? undefined : Object.freeze({ key, classification });
      }, (expression, source, target) => {
        const selected = classifyPair(source, target, "implicit", expression);
        if (selected !== undefined) collectCsharpGeneratedHelpers(selected, requiredHelpers);
        return selected;
      }, requiredRecords, issues, callConversions);
      issues.push(...admitted.issues);
      delegateAdapters = sealCsharpDelegateAdapterIdentities(policy, preparedValueReads, admitted.expressions, issues);
      delegateContracts.seal();
      closed = true;
      Object.freeze(issues);
      sealedClassifications = sealCsharpConversionClassifications({
        ...delegateContracts.records,
        propertyProjectionRoots: openClassifications.propertyProjectionRoots,
        ...createCsharpGeneratedHelperRecords(requiredHelpers),
        issues,
        propertyProjection: openClassifications.propertyProjection,
        delegateAdapters: openClassifications.delegateAdapters,
        directCallableReference: openClassifications.directCallableReference,
        pairSelections,
        expressionSelections: admitted.expressions,
      });
    },
    seal() {
      return sealedClassifications ?? failTargetAnalysisInvariant("tsonic-csharp", "Native conversion publication requires its closed preparation.");
    },
  };
  return Object.freeze(analysis);

  function classifyPair(
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
    node: Node | undefined,
  ): CsharpConversionSelection | undefined {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "A closed conversion preparation cannot classify another native pair.", node);
    if (source === undefined || target === undefined) {
      return csharpUnavailableConversion;
    }
    const key = csharpConversionKey(source, target, mode);
    const previous = pairSelections.get(key);
    if (previous !== undefined && previous.kind !== "rejected") {
      return previous;
    }
    if (node !== undefined) prepareStructuralDependencies(node, source, target);
    if (!reserveClassification(node)) {
      return undefined;
    }
    const selected = admitCsharpConversionSelection(conversionPolicy, source, target,
      selectCsharpConversion(conversionPolicy, source, target, mode));
    pairSelections.set(key, selected);
    admitCsharpDelegateEmission(delegateContracts, source, target, selected);
    return selected;
  }

  function classifyExpression(
    expression: Node,
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
    exactInteger = false,
    sourceCompletion?: CsharpNativeCompletion,
  ): CsharpConversionSelection | undefined {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "A closed conversion preparation cannot classify another native expression.", expression);
    if (source === undefined || target === undefined) {
      return csharpUnavailableConversion;
    }
    const key = csharpConversionKey(source, target, mode);
    let selections = expressionSelections.get(expression);
    const previousClassification = selections?.get(key);
    const previous = previousClassification?.selection;
    if (previous !== undefined && previous.kind !== "rejected") {
      return previous;
    }
    prepareStructuralDependencies(expression, source, target);
    if (!reserveClassification(expression)) {
      return undefined;
    }
    const sourceFile = policy.ast.getSourceFile(expression);
    const reference = policy.navigation.referenceFor(expression);
    if (reference !== undefined && isSourceOwnedProjectReference(reference, policy) &&
      policy.ast.is.IsFunctionDeclaration(reference.declaration) &&
      policy.ast.is.IsSourceFile(policy.ast.parent(reference.declaration)) &&
      !policy.navigation.declarationUseSummary(reference.declaration).bindingWritten) {
      directCallables.set(expression, Object.freeze({ ...reference }));
    }
    let candidate = selectCsharpIntegerTruncationConversion(policy, expression, sourceFile, source, target) ?? selectCsharpExpressionConversion(
      conversionPolicy,
      expression,
      source,
      target,
      mode,
    );
    if (exactInteger && mode === "implicit" && candidate.kind === "rejected") {
      candidate = selectCsharpExactIntegerConversion(source, target) ?? candidate;
    }
    const selected = admitCsharpConversionSelection(conversionPolicy, source, target, candidate.kind === "delegate-adapter" && candidate.strategy === "adaptation" &&
        (
          sourceFile === undefined ||
          !isSourceOwnedCallableRuntimeCarrierSubject(
            expression,
            sourceFile,
            policy,
          )
        )
      ? Object.freeze({
          kind: "rejected" as const,
          reason:
            "C# delegate adaptation requires a source-owned callable; provider-owned delegate conversion requires provider conversion metadata.",
        })
      : candidate, sourceCompletion);
    literalRequests.requestConversion(expression, source, target, selected);
    if (selections === undefined) {
      selections = new Map();
      expressionSelections.set(expression, selections);
    }
    selections.set(key, Object.freeze({ source, target, selection: selected }));
    admitCsharpDelegateEmission(delegateContracts, source, target, selected);
    return selected;
  }

  function prepareStructuralDependencies(expression: Node, source: TargetTypeRef, target: TargetTypeRef): void {
    const pending = [{ source, target }];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index++) {
      const pair = pending[index]!;
      const key = csharpConversionKey(pair.source, pair.target, "implicit");
      if (visited.has(key)) continue;
      visited.add(key);
      const source = getCsharpNullableElementTargetType(pair.source) ?? pair.source;
      const target = getCsharpNullableElementTargetType(pair.target) ?? pair.target;
      const shape = objectShapes.resolveTarget(source);
      const contract = objectShapes.resolveTarget(target);
      if (shape?.sourceType !== undefined && contract !== undefined && !targetTypeRefEquals(source, target) &&
        shape.implements?.some(implemented => targetTypeRefEquals(implemented, target)) !== true) {
        objectShapes.registerStructuralInterface(expression, pair.source, pair.target, shape.sourceType);
      }
      const from = getCsharpDelegateSignature(source);
      const to = getCsharpDelegateSignature(target);
      if (from !== undefined && to !== undefined) {
        if (!csharpDelegateSignatureHasSupportedPassingModes(from) || !csharpDelegateSignatureHasSupportedPassingModes(to) ||
          from.parameters.length > to.parameters.length || from.restParameterIndex !== to.restParameterIndex ||
          from.returnPassing !== to.returnPassing || from.returnPassing !== undefined ||
          from.parameterPassingModes.some(mode => mode !== "by-value") || to.parameterPassingModes.some(mode => mode !== "by-value")) continue;
        for (const [parameterIndex, sourceParameter] of from.parameters.entries()) {
          pending.push({ source: to.parameters[parameterIndex]!, target: sourceParameter });
        }
        if (!isCsharpVoidTargetType(to.returnType)) pending.push({ source: from.returnType, target: to.returnType });
      } else if (source.kind === "tuple" && target.kind === "tuple" && source.elements.length === target.elements.length) {
        for (const [elementIndex, element] of source.elements.entries()) {
          pending.push({ source: element, target: target.elements[elementIndex]! });
        }
      } else if (source.kind === "target-named" && target.kind === "target-named" && source.id === target.id) {
        const parameters = csharpTargetBindingFact(csharpProviderBindingFromResolution(policy.providers.findTargetBindingByTargetId(source.id, "ordinary")))?.typeParameters;
        const sourceArguments = source.typeArguments ?? [];
        const targetArguments = target.typeArguments ?? [];
        if (parameters === undefined || sourceArguments.length !== targetArguments.length || parameters.length !== sourceArguments.length) continue;
        for (const [argumentIndex, sourceArgument] of sourceArguments.entries()) {
          const targetArgument = targetArguments[argumentIndex]!;
          if (targetTypeRefEquals(sourceArgument, targetArgument) || !isCsharpReferenceCarrier(sourceArgument) ||
            !isCsharpReferenceCarrier(targetArgument)) continue;
          const variance = parameters[argumentIndex]!.variance;
          if (variance === "out") pending.push({ source: sourceArgument, target: targetArgument });
          else if (variance === "in") pending.push({ source: targetArgument, target: sourceArgument });
        }
      }
    }
  }

  function reserveClassification(node: Node | undefined): boolean {
    classificationCount += 1;
    if (classificationCount <= maximumConversionClassifications) {
      return true;
    }
    if (!issues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) {
      const issueNode = node ?? policy.sourceFiles[0];
      if (issueNode !== undefined) {
        issues.push(Object.freeze({
          node: issueNode,
          code: "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED",
          message:
            "C# conversion analysis exceeds the finite " +
            maximumConversionClassifications +
            "-classification limit.",
        }));
      }
    }
    return false;
  }
}

import { collectCsharpConversionRequirements } from "./requirements.js";
import { csharpConversionKey, sealCsharpConversionClassifications } from "../program/records/conversions.js";
import { csharpUnavailableConversion } from "../../target-model/records/conversions.js";
