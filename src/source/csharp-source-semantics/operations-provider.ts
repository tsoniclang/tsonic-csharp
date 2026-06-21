import {
  TstsProviderContractVersion,
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedConversionMappingRequest,
  CheckedConversionMappingResult,
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ContextualTargetTypeRequest,
  ContextualTargetTypeResult,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  ParameterPassingRequest,
  ParameterPassingResult,
  ProviderIdentity,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetMember,
  TargetSemanticProvider,
  TargetTypeRef,
} from "@tsonic/tsts";
import { csharpTargetIterationFactKey } from "../csharp-facts.js";
import type { CsharpObjectShapeFact, CsharpTargetIterationFact } from "../csharp-facts.js";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import { csharpProviderVersion, csharpTargetId } from "./identity.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  getCsharpConversionOperation,
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isCsharpStringType,
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
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
  selectTargetMember,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import {
  getTypeofComparisonOperation,
  getTypeofRuntimeKind,
} from "./typeof-operators.js";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  createCsharpNodejsSurfaceMappers,
} from "./surfaces/nodejs/index.js";
import {
  mapCsharpCheckedCall,
} from "./checked-call-mapping.js";
import {
  mapCsharpCheckedElementAccess,
  mapCsharpCheckedPropertyAccess,
} from "./checked-member-access-mapping.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;
const checkedOperationSyntaxFactQuery = { allowSemanticTypeQuery: false } satisfies TargetTypeRefResolutionOptions;

export interface CsharpOperationsProviderHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly mapRuntimeCarrier: (
    request: RuntimeCarrierFactRequest,
    context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  ) => ExtensionObservation<RuntimeCarrierFactResult>;
}

export function createCsharpOperationsProvider(
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpOperationsProviderHost,
): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  const jsSurfaceEnabled = selectedSurfaceIds.has("js");
  const nodejsSurfaceEnabled = selectedSurfaceIds.has("nodejs");
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(identity.id, host));
  const nodejsSurface = createCsharpNodejsSurfaceMappers(identity.id);
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return useObservationOrWhenDeferred(
        host.mapRuntimeCarrier(request, context),
        () => jsSurfaceEnabled ? jsSurface.mapRuntimeCarrier(request, context) : deferObservation,
      );
    },
    mapCheckedCall(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedCall(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedCall(request, context, identity.id, host),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedCall(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedPropertyAccess(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedPropertyAccess(request, context, identity.id, host),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedElementAccess(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpCheckedElementAccess(request, context, identity.id, host),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedElementAccess(request, context) : deferObservation,
      );
    },
    mapCheckedOperator(request, context) {
      return mapCsharpCheckedOperator(request, context, host);
    },
    mapCheckedIteration(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpNativeCheckedIteration(request, context, host),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedIteration(request, context) : deferObservation,
      );
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context, host);
    },
    resolveParameterPassing(request, context) {
      return mapCsharpParameterPassing(request, context);
    },
  };
}

export function createCsharpJsSurfaceHost(extensionId: string, host: CsharpOperationsProviderHost) {
  return {
    targetId: csharpTargetId,
    extensionId,
    getTargetTypeRefForSubject: host.getTargetTypeRefForSubject,
    unwrapNullableTargetType,
    isCsharpStringType,
    isIntegralTargetTypeRef,
    isLiteralRepresentableAsTargetType,
    selectTargetMember: (
      candidates: readonly TargetMember[],
      arguments_: readonly ExtensionFactSubject[],
      context: ExtensionObservationContext,
    ) =>
      selectTargetMember(candidates, arguments_, context, host.getTargetTypeRefForSubject),
    getCsharpObjectShapeFactForSubject: host.getCsharpObjectShapeFactForSubject,
    csharpProviderDiagnostic,
  };
}

export function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}

function mapCsharpCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const typeofComparison = getTypeofComparisonOperation(request, context);
  if (typeofComparison !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: typeofComparison,
    }, [{ message: "C# typeof comparison selected from checked TSTS operator result." }]);
  }
  if (request.operator === "typeof") {
    const operandType = host.getTargetTypeRefForSubject(request.leftType, context, noRuntimeCarrierQuery) ??
      host.getTargetTypeRefForSubject(request.left, context, noRuntimeCarrierQuery);
    const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
    if (runtimeKind === undefined) {
      return deferObservation;
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(`tsonic.csharp.typeof.${runtimeKind}`, "operator", `typeof:${runtimeKind}`),
    }, [{ message: "C# typeof runtime kind selected from checked TSTS operand type." }]);
  }
  if (request.operator === "instanceof") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.instanceof", "operator", "is"),
    }, [{ message: "C# type-test operation selected from checked TSTS instanceof expression." }]);
  }
  const targetOperator = getCsharpOperatorTargetOperation(request.operator);
  if (targetOperator === undefined) {
    return deferObservation;
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const left = host.getTargetTypeRefForSubject(request.leftType, context) ??
    host.getTargetTypeRefForSubject(request.left, context, operandQuery);
  const right = host.getTargetTypeRefForSubject(request.rightType, context) ??
    host.getTargetTypeRefForSubject(request.right, context, operandQuery) ??
    getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context);
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return deferObservation;
  }
  if (left.kind === "type-parameter" || right?.kind === "type-parameter") {
    return deferObservation;
  }
  if (isCsharpBitwiseOperator(request.operator) && !isIntegralTargetTypeRef(left)) {
    return deferObservation;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      `tsonic.csharp.operator.${targetOperator}`,
      "operator",
      targetOperator,
      { resultType: getCsharpOperatorResultTypeRef(request, left, right) },
    ),
  }, [{ message: "C# source operator selected after TSTS accepted the operation." }]);
}

function getCsharpOperatorResultTypeRef(
  request: CheckedOperatorMappingRequest,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  return getCsharpOperatorResultTypeRefForOperator(request.operator, left, right);
}

export function getCsharpOperatorResultTypeRefForOperator(
  operator: string,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case "typeof":
      return csharpTargetNamedType("System.String");
    case "??":
      return unwrapNullableTargetType(left) ?? right ?? left;
    default:
      return left;
  }
}

export function getCheckedOperatorOperandQuery(operator: string): TargetTypeRefResolutionOptions {
  return operator === "??" ? {} : checkedOperationSyntaxFactQuery;
}

export function getLiteralTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const unwrappedExpected = unwrapNullableTargetType(expectedOperandType);
  return unwrappedExpected !== undefined && isLiteralRepresentableAsTargetType(unwrappedExpected, operand, context)
    ? unwrappedExpected
    : undefined;
}

function mapCsharpNativeCheckedIteration(
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
        targetOperation: "ForEachStatement",
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

function mapCsharpContextualTargetType(
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

function mapCsharpCheckedConversion(
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

function mapCsharpParameterPassing(
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
