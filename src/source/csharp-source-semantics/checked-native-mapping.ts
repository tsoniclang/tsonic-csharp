import {
  acceptObservation,
  argumentPassingFactKey,
  contextualTargetTypeFactKey,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedConversionMappingRequest,
  CheckedConversionMappingResult,
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  ContextualTargetTypeRequest,
  ContextualTargetTypeResult,
  ExtensionObservation,
  ExtensionObservationContext,
  ParameterPassingRequest,
  ParameterPassingResult,
} from "@tsonic/tsts";
import {
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
  getCsharpConversionOperation,
} from "./target-rules.js";
import {
  getCsharpCollectionElementTargetType,
} from "./target-types.js";
import {
  requiresCsharpProviderConversionEvidence,
} from "./provider-conversion-operators.js";
import {
  mapCsharpIterationOperationRows,
} from "./operation-selection/iteration.js";
import {
  asTargetParameter,
  asType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import type { CsharpOperationsProviderHost } from "./operations-provider.js";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  isAttributeSelectorCallbackExpression,
} from "./source-marker-selectors.js";

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
  const expressionNode = asNodeSubject(request.expression);
  const expressionSourceFile = expressionNode === undefined ? undefined : context.compiler?.ast.getSourceFile(expressionNode);
  const sourceExpressionType = expressionNode === undefined || context.compiler === undefined
    ? undefined
    : context.compiler.checker.getTypeAtLocation(expressionNode, { sourceFile: expressionSourceFile });
  const expressionType = host.getTargetTypeRefForSubject(request.expression, context, expressionEvidenceQuery) ??
    host.getTargetTypeRefForSubject(sourceExpressionType, context, noRuntimeCarrierQuery);
  if (request.kind === "for-of") {
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
  host: CsharpOperationsProviderHost,
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
  if (isAttributeSelectorCallbackExpression(request.expression, context)) {
    return deferObservation;
  }
  if (contextualTypeIsProviderVirtualDeclaration(request, context)) {
    return acceptObservation<ContextualTargetTypeResult>({
      type: request.context,
    }, [{ message: "C# acknowledged provider virtual contextual type without re-entering target type resolution during TSTS contextual checking." }]);
  }
  const targetType = host.getTargetTypeRefForSubject(request.context, context);
  if (targetType === undefined) {
    return acceptObservation<ContextualTargetTypeResult>({
      type: request.context,
    }, [{ message: "C# acknowledged TSTS contextual type without target metadata; no deterministic C# target type was available." }]);
  }
  return acceptObservation<ContextualTargetTypeResult>({
    type: request.context,
    targetType,
  }, [{ message: "C# contextual target type recorded from checked TSTS contextual type and deterministic C# target type." }]);
}

function contextualTypeIsProviderVirtualDeclaration(
  request: ContextualTargetTypeRequest,
  context: ExtensionObservationContext<"type.recordContextualTargetType">,
): boolean {
  const type = asType(request.context);
  const symbol = type === undefined
    ? undefined
    : context.compiler?.checker.getTypeSymbol(type);
  return context.facts.get(request.context, providerVirtualDeclarationFactKey) !== undefined ||
    context.facts.get(symbol, providerVirtualDeclarationFactKey) !== undefined;
}

export function mapCsharpCheckedConversion(
  request: CheckedConversionMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedConversionMappingResult> {
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const source = host.getTargetTypeRefForSubject(request.source, context, noRuntimeCarrierQuery);
  const target = host.getTargetTypeRefForSubject(request.target, context);
  if (target === undefined) {
    return deferObservation;
  }
  const selectedSignatureReturn = context.facts.get(request.source, selectedTargetSignatureFactKey)?.member.returnType;
  if (selectedSignatureReturn !== undefined && targetTypeRefEquals(selectedSignatureReturn, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# selected target operation already returns the selected target type." }]);
  }
  const csharpOperationReturn = context.facts.get(request.source, csharpTargetOperationFactKey)?.resultType;
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
  if (isLiteralRepresentableAsTargetType(target, request.source, context)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# literal argument is statically representable as the selected target type." }]);
  }
  const operation = getCsharpConversionOperation(source, target);
  if (operation !== undefined) {
    context.facts.set(request.source, csharpTargetConversionOperationFactKey, operation.csharpOperation, [{ message: "C# target conversion static member recorded from selected target conversion." }]);
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
      ],
      identity: `csharp-provider-checked-conversion-unsupported:${subjectIdentity(request.expression)}:${source === undefined ? "unresolved" : targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`,
    });
  }
  return acceptObservation<CheckedConversionMappingResult>({
    convertedType: target,
    ...(operation !== undefined ? { operation: operation.operation } : {}),
  }, [{ message: "C# target conversion recorded from checked call argument and selected target parameter." }]);
}

export function mapCsharpParameterPassing(
  request: ParameterPassingRequest,
  context: ExtensionObservationContext<"parameter.resolvePassing">,
): ExtensionObservation<ParameterPassingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const parameter = asTargetParameter(request.parameter);
  if (parameter === undefined) {
    return deferObservation;
  }
  const sourceMarkerPassing = context.facts.get(request.argument, argumentPassingFactKey);
  if (sourceMarkerPassing !== undefined) {
    if (sourceMarkerPassing.mode !== parameter.passingMode) {
      return rejectObservation(csharpProviderDiagnostic(
        context.extensionId,
        "CSHARP_ARGUMENT_PASSING_MODE_MISMATCH",
        9100148,
        `C# parameter passing requires '${parameter.passingMode}', but the selected source marker provided '${sourceMarkerPassing.mode}'.`,
      ));
    }
    return acceptObservation<ParameterPassingResult>({
      passing: sourceMarkerPassing,
    }, [{ message: "C# argument passing reused the finalized source-core storage marker fact for the selected provider parameter." }]);
  }
  return acceptObservation<ParameterPassingResult>({
    passing: {
      mode: parameter.passingMode,
      ...(request.argument !== undefined ? { targetExpression: request.argument } : {}),
    },
  }, [{ message: "C# argument passing recorded from selected target parameter." }]);
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
