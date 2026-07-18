import {
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  csharpTargetTypeofRuntimeOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../operations.js";
import {
  getTypeofRuntimeKind,
} from "../typeof-operators.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpTypeofOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.operator !== "typeof") {
    return undefined;
  }
  const operandType = host.getTargetTypeRefForSubject(request.sourceLeft?.authoredTypeNode, context, noRuntimeCarrierQuery) ??
    host.getTargetTypeRefForSubject(request.sourceLeft?.type, context, noRuntimeCarrierQuery) ??
    host.getTargetTypeRefForSubject(request.left, context, noRuntimeCarrierQuery);
  const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
  if (runtimeKind === undefined) {
    return context.phase === "checking"
      ? deferObservation
      : rejectObservation(csharpProviderDiagnostic(context.extensionId, "CSHARP_TYPEOF_RUNTIME_FACT_NOT_PROVEN", 9100146, "C# typeof expression emission requires a finalized target runtime-kind fact for the exact TSTS-selected operand type."));
  }
  const operationId = `tsonic.csharp.typeof.${runtimeKind}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetTypeofRuntimeOperation(operationId, runtimeKind), [{ message: "C# typeof runtime operation recorded from checked TSTS operand type." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "operator", "typeof"),
  }, [{ message: "C# typeof runtime kind selected from checked TSTS operand type." }]);
}
