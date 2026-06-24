import {
  acceptObservation,
  deferObservation,
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
  csharpTargetIterationFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import type { CsharpTargetIterationFact } from "../csharp-facts.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  getCsharpConversionOperation,
} from "./target-rules.js";
import {
  getCsharpCollectionElementTargetType,
} from "./target-types.js";
import {
  getCsharpProviderConversionOperator,
} from "./provider-conversion-operators.js";
import {
  targetOperation,
} from "./operations.js";
import {
  asTargetParameter,
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import type { CsharpOperationsProviderHost } from "./operations-provider.js";
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
  const expressionType = host.getTargetTypeRefForSubject(request.expression, context, expressionEvidenceQuery) ??
    host.getTargetTypeRefForSubject(request.sourceExpressionType, context, noRuntimeCarrierQuery);
  if (request.kind === "for-of") {
    const elementType = getCsharpCollectionElementTargetType(expressionType);
    if (elementType !== undefined) {
      const fact = {
        operationId: "tsonic.csharp.array.foreach",
        iterationKind: "sync",
        lowering: { kind: "foreach" },
        elementType,
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# array for-of maps to foreach." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
      }, [{ message: "C# array iteration fact recorded after TSTS accepted for-of." }]);
    }
    return deferObservation;
  }
  return deferObservation;
}

export function mapCsharpContextualTargetType(
  request: ContextualTargetTypeRequest,
  context: ExtensionObservationContext<"type.recordContextualTargetType">,
  _host: CsharpOperationsProviderHost,
): ExtensionObservation<ContextualTargetTypeResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isAttributeSelectorCallbackExpression(request.expression, context)) {
    return deferObservation;
  }
  return acceptObservation<ContextualTargetTypeResult>({
    type: request.context,
  }, [{ message: "C# contextual target type recorded from checked TSTS contextual type for post-check target mapping." }]);
}

export function mapCsharpCheckedConversion(
  request: CheckedConversionMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedConversionMappingResult> {
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const source = host.getTargetTypeRefForSubject(request.source, context);
  const target = host.getTargetTypeRefForSubject(request.target, context);
  if (target === undefined) {
    return deferObservation;
  }
  const selectedSignatureReturn = context.facts.get(request.source, selectedTargetSignatureFactKey)?.member.returnType;
  if (selectedSignatureReturn !== undefined && targetTypeRefEquals(selectedSignatureReturn, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      ...(source !== undefined ? { sourceType: source } : {}),
      convertedType: target,
    }, [{ message: "C# selected target operation already returns the selected target type." }]);
  }
  const csharpOperationReturn = context.facts.get(request.source, csharpTargetOperationFactKey)?.resultType;
  if (csharpOperationReturn !== undefined && targetTypeRefEquals(csharpOperationReturn, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      ...(source !== undefined ? { sourceType: source } : {}),
      convertedType: target,
    }, [{ message: "C# finalized target operation already returns the selected target type." }]);
  }
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      sourceType: source,
      convertedType: target,
    }, [{ message: "C# argument already has the selected target type." }]);
  }
  if (isLiteralRepresentableAsTargetType(target, request.source, context)) {
    return acceptObservation<CheckedConversionMappingResult>({
      ...(source !== undefined ? { sourceType: source } : {}),
      convertedType: target,
    }, [{ message: "C# literal argument is statically representable as the selected target type." }]);
  }
  const providerConversion = getCsharpProviderConversionOperator(source, target, host, "implicit-only");
  if (providerConversion.kind === "matched") {
    context.facts.set(
      request.source,
      csharpTargetConversionOperationFactKey,
      providerConversion.csharpOperation,
      [{ message: "C# provider implicit conversion operator recorded from reflected target member facts." }],
    );
    return acceptObservation<CheckedConversionMappingResult>({
      sourceType: providerConversion.operator.sourceType,
      convertedType: target,
      operation: providerConversion.operation,
    }, [{ message: "C# target conversion recorded from reflected provider implicit conversion operator." }]);
  }
  const operation = getCsharpConversionOperation(source, target);
  if (operation !== undefined) {
    context.facts.set(request.source, csharpTargetConversionOperationFactKey, operation.csharpOperation, [{ message: "C# target conversion static member recorded from selected target conversion." }]);
  }
  return acceptObservation<CheckedConversionMappingResult>({
    ...(source !== undefined ? { sourceType: source } : {}),
    convertedType: target,
    ...(operation !== undefined ? { operation: operation.operation } : {}),
  }, [{ message: "C# target conversion recorded from checked call argument and selected target parameter." }]);
}

export function mapCsharpParameterPassing(
  request: ParameterPassingRequest,
  _context: ExtensionObservationContext<"parameter.resolvePassing">,
): ExtensionObservation<ParameterPassingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const parameter = asTargetParameter(request.parameter);
  if (parameter === undefined) {
    return deferObservation;
  }
  return acceptObservation<ParameterPassingResult>({
    passing: {
      mode: parameter.passingMode,
      ...(request.argument !== undefined ? { targetExpression: request.argument } : {}),
    },
  }, [{ message: "C# argument passing recorded from selected target parameter." }]);
}
