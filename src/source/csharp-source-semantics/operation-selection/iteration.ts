import {
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  recordCsharpRuntimeCarrierFact,
  csharpTargetIterationFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpTargetIterationFact,
  CsharpTargetIterationLowering,
} from "../../csharp-facts.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  targetOperation,
} from "../operations.js";
import {
  asTargetTypeRef,
} from "../../fact-subjects.js";

export interface CsharpIterationOperationRow {
  readonly sourceIterationKind: CheckedIterationMappingRequest["iterationKind"];
  readonly operationId: string;
  readonly iterationKind: CsharpTargetIterationFact["iterationKind"];
  readonly lowering: CsharpTargetIterationLowering;
  readonly elementType?: ExtensionFactSubject;
  readonly evidence: readonly ExtensionEvidence[];
}

export function mapCsharpIterationOperationRows(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  extensionId: string,
  rows: readonly CsharpIterationOperationRow[],
): ExtensionObservation<CheckedOperationMappingResult> {
  const matching = rows.filter((row) => row.sourceIterationKind === request.iterationKind);
  if (matching.length === 0) {
    void extensionId;
    return deferObservation;
  }
  if (matching.length > 1) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ITERATION_OPERATION_AMBIGUOUS",
      9100174,
      `C# target found ${matching.length} finalized iteration metadata rows for a checked ${request.iterationKind} operation. Provider/surface metadata must select exactly one row before backend emission.`,
      [{
        message: "Ambiguous iteration metadata rows",
        details: {
          sourceIterationKind: request.iterationKind,
          operationIds: matching.map((row) => row.operationId),
          lowerings: matching.map((row) => row.lowering.kind),
        },
      }],
    ));
  }
  const row = matching[0]!;
  const fact = iterationFactFromRow(row);
  context.facts.set(request.statement, csharpTargetIterationFactKey, fact, row.evidence);
  recordIterationBindingCarrier(request, context, row);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
  }, row.evidence);
}

export function iterationFactFromRow(row: CsharpIterationOperationRow): CsharpTargetIterationFact {
  return {
    operationId: row.operationId,
    iterationKind: row.iterationKind,
    lowering: row.lowering,
    ...(row.elementType !== undefined ? { elementType: row.elementType } : {}),
    evidence: row.evidence,
  };
}

function recordIterationBindingCarrier(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  row: CsharpIterationOperationRow,
): void {
  const carrier = asTargetTypeRef(row.elementType);
  if (carrier === undefined) {
    return;
  }
  for (const subject of [
    request.initializer,
    request.sourceElement.authoredTypeNode,
    request.sourceElement.type,
  ]) {
    if (subject !== undefined) {
      recordCsharpRuntimeCarrierFact(context.facts, subject, { carrier }, row.evidence);
    }
  }
}
