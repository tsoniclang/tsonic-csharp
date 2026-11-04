import type { SourceEffectiveTypeOutcome } from "@tsonic/target-api/source";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpTargetElementSelection } from "../../target-model/records/operations/member-selections.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function selectCsharpSourceTypeFlowIndexConversion(
  outcome: SourceEffectiveTypeOutcome | undefined,
  selection: CsharpTargetElementSelection | undefined,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): CsharpConversionSelection | undefined {
  if (outcome === undefined || outcome.kind === "refused" ||
    outcome.provenance.fixedRule?.kind !== "loop-counter" ||
    outcome.type.kind !== "primitive" || outcome.type.primitive !== "int64" ||
    source?.kind !== "source-primitive" || source.name !== "int64" ||
    target?.kind !== "source-primitive" || target.name !== "int32") return undefined;
  const parameter = selection?.kind === "resolved"
    ? selection.targetMember.parameters[selection.targetParameterIndex]
    : undefined;
  const indexType = selection?.kind === "project-indexer" ? selection.keyType : parameter?.type;
  if (selection?.kind !== "resolved" && selection?.kind !== "project-indexer" ||
    outcome.provenance.occurrence !== selection.source.argument.expression ||
    indexType === undefined || !targetTypeRefEquals(indexType, target) ||
    parameter !== undefined && parameter.passingMode !== undefined && parameter.passingMode !== "by-value") return undefined;
  return Object.freeze({ kind: "checked-native-integer" });
}
