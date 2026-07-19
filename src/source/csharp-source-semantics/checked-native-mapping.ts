import {
  acceptObservation,
  contextualTargetTypeFactKey,
  deferObservation,
  rejectObservation,
  selectedTargetSignatureFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  CheckedConversionMappingRequest,
  CheckedConversionMappingResult,
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  ContextualTargetTypeRequest,
  ContextualTargetTypeResult,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  getRecordedCsharpRuntimeCarrierFact,
  recordCsharpRuntimeCarrierFact,
  csharpTargetConversionOperationFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  subjectIsSourceCoreStructDeclarationPayload,
} from "./source-core-struct-markers.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetCastOperation,
  targetOperation,
} from "./operations.js";
import {
  getCsharpConversionOperation,
} from "./target-rules.js";
import {
  getCsharpCollectionElementTargetType,
  getCsharpDelegateSignature,
  getCsharpTaskResultTargetType,
  isCsharpAnyRuntimeCarrier,
  isCsharpClosedCompatRuntimeCarrier,
  isCsharpRuntimeUnionTargetType,
} from "./target-types.js";
import {
  getCompatAnyTypedBoundaryConversion,
  getCompatAnyTypedBoundaryEvidence,
} from "./compat-any-typed-boundary-conversions.js";
import {
  requiresCsharpProviderConversionEvidence,
} from "./provider-conversion-operators.js";
import {
  mapCsharpIterationOperationRows,
} from "./operation-selection/iteration.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
  targetTypeRefKey,
} from "./target-ref-utils.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import type { CsharpOperationsProviderHost } from "./operations-provider.js";
import {
  resolveCsharpCheckedConversionEvidence,
} from "./checked-conversion-evidence.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;
const expressionEvidenceQuery = { allowSemanticTypeQuery: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpNativeCheckedIteration(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const expressionType = host.getTargetTypeRefForSubject(request.expression, context, expressionEvidenceQuery) ??
    host.getTargetTypeRefForSubject(request.sourceIterable.type, context, noRuntimeCarrierQuery);
  if (request.iterationKind === "for-of") {
    const elementType = getCsharpCollectionElementTargetType(expressionType);
    if (elementType !== undefined) {
      return mapCsharpIterationOperationRows(request, context, csharpTargetId, [{
        sourceIterationKind: "for-of",
        operationId: "tsonic.csharp.collection.foreach",
        iterationKind: "sync",
        lowering: { kind: "foreach" as const },
        elementType,
        evidence: [{ message: "C# provider/native metadata selected sync value iteration after TSTS accepted for-of." }],
      }]);
    }
    return deferObservation;
  }
  return deferObservation;
}

export function mapCsharpContextualTargetType(
  request: ContextualTargetTypeRequest,
  context: ExtensionObservationContext<"type.recordContextualTargetType">,
): ExtensionObservation<ContextualTargetTypeResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const existing = context.facts.get(request.expression, contextualTargetTypeFactKey);
  if (existing !== undefined) {
    return acceptObservation<ContextualTargetTypeResult>(
      existing,
      [{ message: "C# reused existing contextual target type fact for repeated TSTS contextual observation." }],
    );
  }
  if (subjectIsSourceCoreStructDeclarationPayload(request.expression, context)) {
    return acceptObservation<ContextualTargetTypeResult>(
      { type: request.context },
      [{ message: "C# acknowledged TSTS contextual type for source-core struct schema payload without target metadata; schema payload is source metadata, not emitted code." }],
    );
  }
  return acceptObservation<ContextualTargetTypeResult>({
    type: request.context,
  }, [{ message: "C# retained the TSTS-selected contextual source type without re-entering target type resolution during source checking; post-check target facts and backend planning map the recorded source type." }]);
}

export function mapCsharpCheckedConversion(
  request: CheckedConversionMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
  compatibilityMode: TargetTypescriptCompatibilityMode = "strict-native",
): ExtensionObservation<CheckedConversionMappingResult> {
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const conversionEvidence = resolveCsharpCheckedConversionEvidence(request, context, host);
  if (conversionEvidence.kind === "unreconciled") {
    return rejectObservation({
      ...csharpProviderDiagnostic(
        context.extensionId,
        "CSHARP_ASSERTION_SELECTED_TYPE_EVIDENCE_UNRECONCILED",
        9100184,
        "C# cannot reconcile the TSTS-selected assertion type with its supplied source/provider provenance.",
      ),
      nodeOrSpan: request.expression,
      evidence: [
        {
          message: "Unreconciled assertion " + conversionEvidence.side + " evidence",
          details: {
            reason: conversionEvidence.reason,
            semantic: conversionEvidence.semantic ?? "unresolved",
            authored: conversionEvidence.authored,
            ...(conversionEvidence.authoredCandidates === undefined
              ? {}
              : { authoredCandidates: conversionEvidence.authoredCandidates }),
          },
        },
      ],
      identity: "csharp-assertion-selected-type-evidence-unreconciled:" +
        conversionEvidence.side +
        ":" +
        subjectIdentity(request.expression),
    });
  }
  const source = conversionEvidence.source;
  const target = conversionEvidence.target;
  const structuralCompatAssertion = request.conversionKind === "assertion"
    ? mapCsharpClosedCompatStructuralAssertion(request, context, host, compatibilityMode)
    : undefined;
  if (structuralCompatAssertion !== undefined) {
    return structuralCompatAssertion;
  }
  if (target === undefined) {
    return deferObservation;
  }
  const existingConversion = context.facts.get(request.expression, targetConversionFactKey) ??
    context.factResolver.resolve(request.expression, targetConversionFactKey);
  if (existingConversion?.convertedType !== undefined && targetTypeRefEquals(existingConversion.convertedType, target)) {
    return acceptObservation<CheckedConversionMappingResult>(
      existingConversion,
      [{ message: "C# reused existing checked target conversion fact for repeated TSTS conversion observation." }],
    );
  }
  const assertionAnyConversion = request.conversionKind === "assertion"
    ? mapCsharpAnyAssertionConversion(request, source, target, context, compatibilityMode)
    : undefined;
  if (assertionAnyConversion !== undefined) {
    return assertionAnyConversion;
  }
  const selectedSignatureReturn = request.conversionKind === "call-argument"
    ? context.facts.get(request.source.expression, selectedTargetSignatureFactKey)?.member.returnType
    : undefined;
  if (selectedSignatureReturn !== undefined && targetTypeRefEquals(selectedSignatureReturn, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# selected target operation already returns the selected target type." }]);
  }
  const csharpOperationReturn = context.facts.get(request.source.expression, csharpTargetOperationFactKey)?.resultType;
  if (csharpOperationReturn !== undefined && targetTypeRefEquals(csharpOperationReturn, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# finalized target operation already returns the selected target type." }]);
  }
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# argument already has the selected target type." }]);
  }
  if (
    request.conversionKind === "call-argument" &&
    source === undefined &&
    sourceFunctionExpressionHasSelectedTargetDelegate(request.source.expression, target, context)
  ) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# function expression is contextually convertible to the selected delegate target type." }]);
  }
  const delegateMatch = source === undefined
    ? undefined
    : sourceDelegateMatch(source, target);
  if (delegateMatch?.matches === true) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# delegate value is contextually convertible to the selected delegate target type through a closed wrapper." }]);
  }
  const sourceExpression = request.source.expression;
  if (isLiteralRepresentableAsTargetType(target, sourceExpression, context)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# literal argument is statically representable as the selected target type." }]);
  }
  const operation = getCsharpConversionOperation(source, target) ??
    getCsharpSourceDeclaredAssertionCast(request, source, target);
  if (operation === undefined && isCsharpRuntimeUnionTargetType(target) && targetTypeRefIsClosed(target)) {
    return rejectObservation({
      ...csharpProviderDiagnostic(
        context.extensionId,
        "CSHARP_RUNTIME_UNION_CONVERSION_NOT_PROVEN",
        9100187,
        "C# runtime-union conversion requires the checked source carrier to match one exact finalized union arm.",
      ),
      nodeOrSpan: request.expression,
      evidence: [{
        message: "Runtime-union arm conversion not proven",
        details: {
          source: source === undefined ? "unresolved" : targetTypeRefKey(source),
          target: targetTypeRefKey(target),
        },
      }],
      identity: `csharp-runtime-union-conversion-not-proven:${subjectIdentity(request.expression)}:${source === undefined ? "unresolved" : targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`,
    });
  }
  if (
    operation === undefined &&
    getCsharpTaskResultTargetType(source) !== undefined &&
    (source === undefined || !targetTypeRefEquals(source, target))
  ) {
    return rejectObservation({
      ...csharpProviderDiagnostic(
        context.extensionId,
        "CSHARP_TASK_CONVERSION_NOT_PROVEN",
        9100188,
        "C# Task carrier conversion requires a finalized target operation; Task values cannot be implicitly unwrapped or reinterpreted.",
      ),
      nodeOrSpan: request.expression,
      evidence: [{
        message: "Task carrier conversion not proven",
        details: {
          source: source === undefined ? "unresolved" : targetTypeRefKey(source),
          target: targetTypeRefKey(target),
        },
      }],
      identity: `csharp-task-conversion-not-proven:${subjectIdentity(request.expression)}:${source === undefined ? "unresolved" : targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`,
    });
  }
  if (operation !== undefined) {
    context.facts.set(request.expression, csharpTargetConversionOperationFactKey, operation.csharpOperation, [{ message: "C# target conversion operation recorded from TSTS-selected conversion evidence." }]);
  }
  if (operation === undefined && requiresCsharpProviderConversionEvidence(source, target, host)) {
    return rejectObservation({
      ...csharpProviderDiagnostic(
        context.extensionId,
        "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED",
        9100138,
        "C# provider checked conversion requires a finalized provider conversion operator fact.",
      ),
      nodeOrSpan: request.expression,
      evidence: [
        {
          message: "Missing provider conversion operator",
          details: "The source or target type is provider-owned, so checked conversion emission requires an exact TSTS-selected provider conversion operator identity. The current checked conversion observation request exposes source and target types only, not the selected provider conversion operator id.",
        },
        {
          message: "Source C# target type",
          details: source ?? "unresolved",
        },
        {
          message: "Target C# target type",
          details: target,
        },
        ...(delegateMatch === undefined ? [] : [{
          message: "Delegate conversion shape",
          details: delegateMatch,
        }]),
      ],
      identity: `csharp-provider-checked-conversion-unsupported:${subjectIdentity(request.expression)}:${source === undefined ? "unresolved" : targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`,
    });
  }
  return acceptObservation<CheckedConversionMappingResult>({
    convertedType: target,
    ...(operation !== undefined ? { operation: operation.operation } : {}),
  }, [{ message: request.conversionKind === "assertion"
    ? `C# target conversion recorded from checked ${request.assertionKind} assertion source and target evidence.`
    : "C# target conversion recorded from checked call argument and selected target parameter." }]);
}

function mapCsharpClosedCompatStructuralAssertion(
  request: Extract<CheckedConversionMappingRequest, { readonly conversionKind: "assertion" }>,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): ExtensionObservation<CheckedConversionMappingResult> | undefined {
  const targetShape = host.getCsharpObjectShapeFactForSubject(request.explicitTargetTypeNode, context) ??
    host.getCsharpObjectShapeFactForSubject(request.target.type, context);
  if (
    compatibilityMode !== "compat" ||
    targetShape === undefined
  ) {
    return undefined;
  }
  const sourceOperationType = context.facts.get(request.source.expression, csharpTargetOperationFactKey)?.resultType ??
    context.factResolver.resolve(request.source.expression, csharpTargetOperationFactKey)?.resultType;
  const sourceCarrier = getRecordedCsharpRuntimeCarrierFact(context.facts, request.source.expression)?.carrier ??
    sourceOperationType;
  if (sourceCarrier === undefined || !isCsharpClosedCompatRuntimeCarrier(sourceCarrier)) {
    return undefined;
  }
  const evidence = [{
    message: "C# compat structural assertion preserves the exact closed runtime carrier selected for the source expression; TSTS-selected structural members remain compile-time evidence.",
  }];
  recordCsharpRuntimeCarrierFact(context.facts, request.expression, { carrier: sourceCarrier }, evidence);
  return acceptObservation<CheckedConversionMappingResult>({
    convertedType: sourceCarrier,
  }, evidence);
}

function mapCsharpAnyAssertionConversion(
  request: Extract<CheckedConversionMappingRequest, { readonly conversionKind: "assertion" }>,
  source: ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>,
  target: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): ExtensionObservation<CheckedConversionMappingResult> | undefined {
  const sourceRuntimeCarrier = getRecordedCsharpRuntimeCarrierFact(context.facts, request.source.expression)?.carrier ??
    getRecordedCsharpRuntimeCarrierFact(context.facts, request.source.type)?.carrier;
  const targetRuntimeCarrier = getRecordedCsharpRuntimeCarrierFact(context.facts, request.target.type)?.carrier;
  const sourceHasOpaqueAnyCarrier = isCsharpAnyRuntimeCarrier(source) ||
    isCsharpAnyRuntimeCarrier(sourceRuntimeCarrier);
  const targetHasOpaqueAnyCarrier = isCsharpAnyRuntimeCarrier(target) ||
    isCsharpAnyRuntimeCarrier(targetRuntimeCarrier);
  if (!sourceHasOpaqueAnyCarrier && !targetHasOpaqueAnyCarrier) {
    return undefined;
  }
  const compatConversion = compatibilityMode === "compat"
    ? getCompatAnyTypedBoundaryConversion(source, target, sourceHasOpaqueAnyCarrier)
    : undefined;
  if (compatConversion?.kind === "identity") {
    return acceptObservation<CheckedConversionMappingResult>({}, [{ message: "C# compat assertion preserves the existing closed any carrier without a target conversion." }]);
  }
  if (compatConversion !== undefined) {
    const evidence = getCompatAnyTypedBoundaryEvidence(compatConversion.kind);
    context.facts.set(request.expression, csharpTargetConversionOperationFactKey, compatConversion.csharpOperation, evidence);
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: compatConversion.convertedType,
      operation: compatConversion.operation,
    }, evidence);
  }
  return rejectObservation({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED",
      9100122,
      "C# assertion conversion cannot cross a TypeScript any boundary without finalized target conversion facts.",
    ),
    nodeOrSpan: request.expression,
    evidence: [
      {
        message: "C# dynamic assertion boundary rejected",
        details: "TSTS accepted the assertion through any, but strict-native C# has no finalized closed-carrier conversion for the selected source and target types.",
      },
    ],
    identity: `csharp-any-assertion:${subjectIdentity(request.expression)}`,
  });
}

function getCsharpSourceDeclaredAssertionCast(
  request: CheckedConversionMappingRequest,
  source: ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>,
  target: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
): {
  readonly operation: NonNullable<CheckedConversionMappingResult["operation"]>;
  readonly csharpOperation: ReturnType<typeof csharpTargetCastOperation>;
} | undefined {
  if (
    request.conversionKind !== "assertion" ||
    source === undefined ||
    (!isSourceDeclaredTargetType(source) && !isSourceDeclaredTargetType(target))
  ) {
    return undefined;
  }
  const operationId = `tsonic.csharp.cast:${targetTypeRefKey(target)}`;
  return {
    operation: targetOperation(operationId, "operator", "cast"),
    csharpOperation: csharpTargetCastOperation(operationId, target),
  };
}

function isSourceDeclaredTargetType(type: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>): boolean {
  return type.kind === "target-named" &&
    "csharpSourceDeclarationKind" in type &&
    type.csharpSourceDeclarationKind !== undefined;
}

function sourceFunctionExpressionHasSelectedTargetDelegate(
  subject: CheckedConversionMappingRequest["source"]["expression"],
  target: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
): boolean {
  const contextual = context.facts.get(subject, contextualTargetTypeFactKey) ??
    context.factResolver.resolve(subject, contextualTargetTypeFactKey);
  return contextual?.targetType !== undefined &&
    targetTypeRefEquals(contextual.targetType, target) &&
    getCsharpDelegateSignature(target) !== undefined;
}

function sourceDelegateMatch(
  source: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
  target: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
): { readonly matches: boolean; readonly reason?: string; readonly parameterIndex?: number } {
  const sourceDelegate = getCsharpDelegateSignature(source);
  const targetDelegate = getCsharpDelegateSignature(target);
  if (sourceDelegate === undefined || targetDelegate === undefined || sourceDelegate.parameters.length !== targetDelegate.parameters.length) {
    return {
      matches: false,
      reason: sourceDelegate === undefined
        ? "source-not-delegate"
        : targetDelegate === undefined
          ? "target-not-delegate"
          : "parameter-count",
    };
  }
  for (let index = 0; index < targetDelegate.parameters.length; index += 1) {
    const expected = targetDelegate.parameters[index];
    const actual = sourceDelegate.parameters[index];
    if (expected === undefined || actual === undefined || !targetTypeRefEquals(expected, actual)) {
      return {
        matches: false,
        reason: "parameter-type",
        parameterIndex: index,
      };
    }
  }
  return targetTypeRefEquals(targetDelegate.returnType, sourceDelegate.returnType)
    ? { matches: true }
    : { matches: false, reason: "return-type" };
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
