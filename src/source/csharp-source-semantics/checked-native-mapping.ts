import {
  acceptObservation,
  contextualTargetTypeFactKey,
  deferObservation,
  rejectObservation,
  selectedTargetSignatureFactKey,
  targetConversionFactKey,
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
  getCsharpDelegateSignature,
} from "./target-types.js";
import {
  requiresCsharpProviderConversionEvidence,
} from "./provider-conversion-operators.js";
import {
  mapCsharpIterationOperationRows,
} from "./operation-selection/iteration.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import type { CsharpOperationsProviderHost } from "./operations-provider.js";
import {
  getTargetArgumentConversionType,
} from "./target-member-arguments/argument-conversions.js";
import {
  asNodeSubject,
} from "./ast-utils.js";

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
): ExtensionObservation<CheckedConversionMappingResult> {
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const source = host.getTargetTypeRefForSubject(request.source, context, noRuntimeCarrierQuery);
  const conversionTarget = request.targetParameter === undefined
    ? request.target
    : getTargetArgumentConversionType(request.targetParameter);
  const target = host.getTargetTypeRefForSubject(conversionTarget, context);
  if (target === undefined) {
    return deferObservation;
  }
  const existingConversion = context.facts.get(request.source, targetConversionFactKey) ??
    context.factResolver.resolve(request.source, targetConversionFactKey);
  if (existingConversion?.convertedType !== undefined && targetTypeRefEquals(existingConversion.convertedType, target)) {
    return acceptObservation<CheckedConversionMappingResult>(
      existingConversion,
      [{ message: "C# reused existing checked target conversion fact for repeated TSTS conversion observation." }],
    );
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
  if (source === undefined && sourceFunctionExpressionHasSelectedTargetDelegate(request.source, target, context)) {
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
  }, [{ message: "C# target conversion recorded from checked call argument and selected target parameter." }]);
}

function sourceFunctionExpressionHasSelectedTargetDelegate(
  subject: CheckedConversionMappingRequest["source"],
  target: NonNullable<ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>>,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
): boolean {
  return sourceSubjectIsFunctionExpression(subject, context) && getCsharpDelegateSignature(target) !== undefined;
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

function sourceSubjectIsFunctionExpression(
  subject: CheckedConversionMappingRequest["source"],
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
): boolean {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  return node !== undefined && ast !== undefined && (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node));
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
