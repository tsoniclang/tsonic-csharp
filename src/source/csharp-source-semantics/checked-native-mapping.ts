import {
  acceptObservation,
  deferObservation,
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
import { CsharpTargetIterationOperation, csharpTargetIterationFactKey } from "../csharp-facts.js";
import type { CsharpTargetIterationFact } from "../csharp-facts.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  getCsharpConversionOperation,
} from "./target-rules.js";
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

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpNativeCheckedIteration(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const expressionType = host.getTargetTypeRefForSubject(request.sourceExpressionType, context, noRuntimeCarrierQuery);
  if (request.kind === "for-of") {
    if (expressionType?.kind === "array") {
      const fact = {
        operationId: "tsonic.csharp.array.foreach",
        iterationKind: "sync",
        targetOperation: CsharpTargetIterationOperation.foreachStatement,
        elementType: expressionType.element,
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# array for-of maps to foreach." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.targetOperation),
      }, [{ message: "C# array iteration fact recorded after TSTS accepted for-of." }]);
    }
    return deferObservation;
  }
  return deferObservation;
}

export function mapCsharpContextualTargetType(
  request: ContextualTargetTypeRequest,
  _context: ExtensionObservationContext<"type.recordContextualTargetType">,
): ExtensionObservation<ContextualTargetTypeResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  return acceptObservation<ContextualTargetTypeResult>({
    type: request.context,
  }, [{ message: "C# contextual target type recorded from checked TSTS contextual type." }]);
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
  return acceptObservation<CheckedConversionMappingResult>({
    convertedType: target,
    ...(operation !== undefined ? { operation } : {}),
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
