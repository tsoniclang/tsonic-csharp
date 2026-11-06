import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpConversion, selectCsharpExpressionConversion } from "../../policy/conversions/index.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpTargetBindingFact, isCsharpReferenceCarrier, targetTypeRefKey, targetTypeRefEquals } from "../../policy/types/index.js";
import { isSourceOwnedCallableRuntimeCarrierSubject, isSourceOwnedProjectReference } from "../source-evidence/types/resolution/source-ownership.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpClosedShapeMemberProjection } from "../../target-model/records/objects/closed-object-shapes.js";

import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpStructuralInterfaceRegistration } from "../objects/structural-interfaces.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";

import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpConversionAnalysis, CsharpPreparedConversionClassifications } from "./model.js";
import type { CsharpConversionClassifications, CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/operations/conversions.js";
import { sealCsharpDelegateAdapterIdentities } from "./delegate-identities.js";

import { selectCsharpIntegerTruncationConversion } from "./integer-truncation.js";
import { selectCsharpSourceTypeFlowIndexConversion } from "../../policy/conversions/source-type-flow-index.js";
import { selectCsharpExactIntegerConversion } from "../../policy/conversions/exact-integer.js";
import { admitCsharpConversionSelection } from "./validation.js";

import { createCsharpExactLiteralRequestCollector } from "./literal-requests.js";
import { sealCsharpConversionUses, type CsharpCallConversionRequests } from "./use-admission.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native/native-demand.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { createCsharpDelegateContractProducer } from "../program/records/callables/callable-conversions.js";
import { admitCsharpDelegateEmission, admitCsharpDelegateOperand } from "./callable-emission.js";
import { sourceTransparentExpressionOperand } from "@tsonic/target-api/source";
import { readCsharpSelectedWritingReference } from "../callables/values/argument-passing.js";
import { sourceAnnotationHint } from "@tsonic/target-api/source";
import { tsonicCoreSourceSemanticsModules } from "@tsonic/source-core";
import { isCsharpIntegralTargetType } from "../../target-model/types/carriers/scalar-types.js";

const maximumConversionClassifications = 1_048_576;

export function csharpConversionOperandStability(expression: Node, policy: CsharpPolicyContext,
  operations: Pick<CsharpTargetOperationClassifications, "selectedProperty" | "selectedCall" | "selectedConstruction">,
  evidence: Pick<CsharpSourceEvidenceIndex, "sourceArgument">): "stable" | "snapshot" {
  const seen = new Set<Node>();
  for (let current: Node | undefined = expression; current !== undefined;) {
    if (seen.has(current)) return "snapshot";
    seen.add(current);
    const transparent = sourceTransparentExpressionOperand(policy.ast, current);
    if (transparent !== undefined) { current = transparent; continue; }
    const kind = policy.ast.kindName(current);
    if (kind === "KindThisKeyword" || kind === "KindSuperKeyword" || kind === "KindNullKeyword" ||
      kind === "KindTrueKeyword" || kind === "KindFalseKeyword" || kind === "KindStringLiteral" ||
      kind === "KindNumericLiteral" || kind === "KindBigIntLiteral" || kind === "KindNoSubstitutionTemplateLiteral") return "stable";
    if (policy.ast.is.IsIdentifier(current)) {
      const reference = policy.navigation.referenceFor(current);
      return reference !== undefined && isSourceOwnedProjectReference(reference, policy) &&
        policy.ast.getSourceFile(reference.declaration) === reference.sourceFile &&
        (policy.ast.is.IsVariableDeclaration(reference.declaration) || policy.ast.is.IsParameterDeclaration(reference.declaration) ||
          policy.ast.is.IsFunctionDeclaration(reference.declaration)) &&
        !policy.navigation.declarationUseSummary(reference.declaration).bindingWritten &&
        !policy.navigation.declarationUseSummary(reference.declaration).uses.some(use =>
          readCsharpSelectedWritingReference(policy, evidence, operations, use.reference) !== undefined) ? "stable" : "snapshot";
    }
    const property = operations.selectedProperty.get(current);
    if (property?.selection.kind === "resolved") {
      const { targetMember, receiver, source } = property.selection;
      if (targetMember.kind !== "field" || targetMember.readonly !== true) return "snapshot";
      if (receiver.kind === "none") return "stable";
      current = source.receiver.expression;
      continue;
    }
    if (property?.selection.kind === "source-owned") {
      const member = property.sourceOwned?.shapeMember;
      if (member?.kind !== "resolved" || member.member.readonly !== true || member.member.accessor !== undefined) return "snapshot";
      current = property.selection.source.receiver.expression;
      continue;
    }
    return "snapshot";
  }
  return "snapshot";
}

export function analyzeCsharpConversions(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  objectShapes: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration,
  selectedOperations: CsharpTargetOperationClassifications,
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
  let preparedValueReads: CsharpValueReadClassifications | undefined;
  let sealedClassifications: CsharpConversionClassifications | undefined;
  const literalRequests = createCsharpExactLiteralRequestCollector(policy.literalValues);
  const conversionPolicy = Object.freeze({
    integerRanges: policy.integerRanges,
    ast: policy.ast, literalValues: policy.literalValues, typeDefinitions: policy.typeDefinitions,
    projectTypes: policy.projectTypes, providers: policy.providers, target: policy.target,
    navigation: policy.navigation, sourceFacts: policy.sourceFacts, objectShapes,
  });

  const openClassifications: CsharpConversionClassifications = {
    ...delegateContracts.records,
    get propertyProjectionRoots() { return Object.freeze([...propertyProjectionRoots].flatMap(([node, types]) =>
      [...types.values()].map(carrier => Object.freeze({ node, carrier })))); },
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
        return csharpUnavailableExpressionConversion;
      }
      const key = csharpConversionKey(source, target, mode);
      if (!closed && !expressionSelections.get(expression)?.has(key)) classifyExpression(expression, source, target, mode);
      return expressionSelections.get(expression)?.get(key);
    } }),
  };
  const classifications = Object.freeze(openClassifications);

  const analysis: CsharpConversionAnalysis = {
    classifications,
    prepare({ expectedTypes, valueReads }) {
      if (preparedClassifications !== undefined) return preparedClassifications;
      preparedValueReads = valueReads;
      for (const [expression, selections] of expressionSelections) for (const selection of selections.values()) {
        requestLiteralConversion(expression, selection.source, selection.target, selection.selection, valueReads);
      }
      collectCsharpConversionRequirements({ policy, evidence, objectShapes, operations: selectedOperations, expectedTypes, valueReads,
        literalRequests, classifyPair, classifyExpression, reserveClassification, issues, propertyProjectionRoots,
        propertyProjections, callConversions });
      preparedClassifications = Object.freeze({ ...classifications, exactLiteralRequests: literalRequests.seal() });
      return preparedClassifications;
    },
    close(nativeDemand, requiredRecords, captures, creations) {
      if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Native conversion preparation closes exactly once.");
      if (preparedClassifications === undefined || preparedValueReads === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Native conversion uses require completed preparation.");
      const admitted = sealCsharpConversionUses(nativeDemand, selectedOperations, (expression, source, target, mode, exactInteger, boundary, sourceCompletion) => {
        const selected = boundary === undefined ? classifyExpression(expression, source, target, mode, exactInteger, sourceCompletion) : boundary.selection;
        if (selected === undefined) return undefined;
        admitCsharpDelegateEmission(delegateContracts, source, target, selected);
        issues.push(...admitCsharpDelegateOperand(policy.ast, captures, creations, delegateContracts, expression, source, target, selected));
        if (boundary === undefined && sourceCompletion?.kind !== "void") classifyPair(source, target, mode, expression);
        const key = csharpConversionKey(source, target, mode);
        if (boundary !== undefined) {
          const selections = expressionSelections.get(expression) ?? new Map();
          selections.set(key, Object.freeze({ source, target, selection: selected, operandStability: selected.kind === "delegate-adapter" &&
            selected.strategy === "adaptation" ? operandStability(expression) : "snapshot",
            ...(boundary.identityRequired === true ? { identityRequired: true } : {}) }));
          expressionSelections.set(expression, selections);
        }
        const classification = expressionSelections.get(expression)?.get(key);
        return classification === undefined ? undefined : Object.freeze({ key, classification });
      }, (expression, source, target) => {
        const selected = classifyPair(source, target, "implicit", expression);
        return selected;
      }, requiredRecords, issues, callConversions);
      issues.push(...admitted.issues.map(issue => {
        const source = getCsharpNullableElementTargetType(issue.source) ?? issue.source;
        const target = getCsharpNullableElementTargetType(issue.target) ?? issue.target;
        const integral = source?.kind === "source-primitive" && source.name === "float64" &&
          target !== undefined && isCsharpIntegralTargetType(target);
        const annotationType = integral && target?.kind === "source-primitive"
          ? tsonicCoreSourceSemanticsModules().flatMap(module => module.exports).find(declaration =>
            declaration.kind === "source-primitive" && declaration.primitive === target.name)?.exportName : undefined;
        const hint = sourceAnnotationHint(issue.node, {
          ast: policy.ast, navigation: policy.navigation,
          annotationType,
          call: node => {
            const construction = policy.ast.is.IsNewExpression(node) ? selectedOperations.selectedConstruction.get(node)?.target : undefined;
            return policy.ast.is.IsCallExpression(node) ? selectedOperations.selectedCall.get(node)?.source
              : construction?.kind === "resolved" || construction?.kind === "source-owned" ? construction.source : undefined;
          },
        }) ?? (integral ? "Annotate the value with an integral type." : undefined);
        return hint === undefined ? issue : Object.freeze({ ...issue, message: `${issue.message} ${hint}` });
      }));
      delegateAdapters = sealCsharpDelegateAdapterIdentities(policy, preparedValueReads, admitted.expressions, issues);
      delegateContracts.seal();
      closed = true;
      Object.freeze(issues);
      sealedClassifications = sealCsharpConversionClassifications({
        ...delegateContracts.records,
        propertyProjectionRoots: openClassifications.propertyProjectionRoots,
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
      (policy.moduleCallables.get(reference.declaration) !== undefined ||
        policy.ast.is.IsFunctionDeclaration(reference.declaration) &&
        policy.ast.is.IsSourceFile(policy.ast.parent(reference.declaration)) &&
        !policy.navigation.declarationUseSummary(reference.declaration).bindingWritten)) {
      directCallables.set(expression, Object.freeze({ ...reference }));
    }
    const elementAccess = policy.ast.parent(expression);
    const selectedElement = elementAccess === undefined ? undefined : selectedOperations.selectedElement.get(elementAccess)?.target;
    const retainedIndex = selectedElement?.kind === "resolved" && selectedElement.source.argument.expression === expression &&
      selectedElement.indexConversion !== undefined && targetTypeRefEquals(selectedElement.indexConversion.source, source) &&
      targetTypeRefEquals(selectedElement.indexConversion.target, target) ? selectedElement.indexConversion.selection : undefined;
    const indexConversion = retainedIndex ?? selectCsharpSourceTypeFlowIndexConversion(policy.effectiveTypes.get(expression),
      selectedElement === undefined ? undefined : { kind: "element", selection: selectedElement }, source, target);
    const binary = elementAccess === undefined ? undefined : selectedOperations.binaryOperation.get(elementAccess)?.target;
    const countConversion = binary?.kind !== "resolved" || binary.right !== expression ? undefined
      : selectCsharpSourceTypeFlowIndexConversion(policy.effectiveTypes.get(expression), { kind: "shift-count", operation: binary }, source, target);
    const selectedCall = elementAccess === undefined ? undefined : selectedOperations.selectedCall.get(elementAccess)?.target ??
      selectedOperations.selectedConstruction.get(elementAccess)?.target;
    const argumentIndex = selectedCall?.kind !== "resolved" ? undefined
      : selectedCall.source.sourceArguments.findIndex(argument => argument.expression === expression);
    const argument = selectedCall?.kind !== "resolved" || argumentIndex === undefined ? undefined
      : selectedCall.call.arguments.find(argument => argument.sourceArgumentIndex === argumentIndex);
    const parameter = argument === undefined || selectedCall?.kind !== "resolved" ? undefined
      : selectedCall.call.targetMember.parameters[argument.targetParameterIndex];
    const parameterConversion = parameter === undefined ? undefined : selectCsharpSourceTypeFlowIndexConversion(
      policy.effectiveTypes.get(expression), { kind: "parameter", expression, parameter }, source, target);
    let candidate = indexConversion ?? countConversion ?? parameterConversion ?? selectCsharpIntegerTruncationConversion(policy, expression, sourceFile, source, target) ?? selectCsharpExpressionConversion(
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
    if (selected.kind === "delegate-adapter" && selected.instantiation !== undefined && reference !== undefined &&
      isSourceOwnedProjectReference(reference, policy) &&
      (policy.moduleCallables.get(reference.declaration) !== undefined ||
        policy.ast.is.IsFunctionDeclaration(reference.declaration) &&
        !policy.navigation.declarationUseSummary(reference.declaration).bindingWritten)) {
      const direct = Object.freeze({ ...reference });
      directCallables.set(expression, direct);
      const name = policy.ast.name(reference.declaration);
      if (name !== undefined) directCallables.set(name, direct);
    }
    if (preparedValueReads !== undefined) requestLiteralConversion(expression, source, target, selected, preparedValueReads);
    if (selections === undefined) {
      selections = new Map();
      expressionSelections.set(expression, selections);
    }
    selections.set(key, Object.freeze({ source, target, selection: selected, operandStability: selected.kind === "delegate-adapter" &&
      selected.strategy === "adaptation" ? operandStability(expression) : "snapshot" }));
    admitCsharpDelegateEmission(delegateContracts, source, target, selected);
    return selected;
  }

  function requestLiteralConversion(expression: Node, source: TargetTypeRef, target: TargetTypeRef,
    selection: CsharpConversionSelection, valueReads: CsharpValueReadClassifications): void {
    if (policy.literalValues.literalValue.get(expression) === undefined) return;
    const physicalSource = valueReads.valueRead.get(expression)?.value;
    if (physicalSource === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal conversion requests require completed value reads.", expression);
    literalRequests.requestConversion(expression, source, target, selection, physicalSource);
  }

  function operandStability(expression: Node): "stable" | "snapshot" {
    return csharpConversionOperandStability(expression, policy, selectedOperations, evidence);
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
import { csharpConversionKey, sealCsharpConversionClassifications } from "../program/records/operations/conversions.js";
import { csharpUnavailableConversion, csharpUnavailableExpressionConversion } from "../../target-model/records/operations/conversions.js";
