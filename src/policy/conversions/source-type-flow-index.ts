import { sourceTypeDescriptorsEqual, type SourceEffectiveTypeOutcome } from "@tsonic/target-api/source";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpTargetElementSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpResolvedBinaryOperation } from "../../target-model/records/operations/operator-selection.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";

type CsharpSourceTypeFlowIntegerUse =
  | { readonly kind: "element"; readonly selection: CsharpTargetElementSelection }
  | { readonly kind: "parameter"; readonly expression: Node; readonly parameter: CsharpTargetParameter }
  | { readonly kind: "shift-count"; readonly operation: CsharpResolvedBinaryOperation };

const shifts = new Set(["<<", ">>", ">>>", "<<=", ">>=", ">>>="]);

export function csharpSourceTypeFlowShiftCountType(operation: CsharpResolvedBinaryOperation): TargetTypeRef {
  return shifts.has(operation.sourceOperator) && operation.rightInputType.kind === "source-primitive" &&
    operation.rightInputType.name === "int64" ? csharpSourcePrimitiveTargetType("int32") : operation.rightInputType;
}

export function selectCsharpSourceTypeFlowIndexConversion(
  outcome: SourceEffectiveTypeOutcome | undefined,
  use: CsharpSourceTypeFlowIntegerUse | undefined,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): CsharpConversionSelection | undefined {
  if (outcome === undefined || outcome.kind === "refused" ||
    outcome.type.kind !== "primitive" || outcome.type.primitive !== "int64" ||
    source?.kind !== "source-primitive" || source.name !== "int64" ||
    target?.kind !== "source-primitive" || target.name !== "int32") return undefined;
  const selection = use?.kind === "element" ? use.selection : undefined;
  const parameter = use?.kind === "parameter" ? use.parameter : selection?.kind === "resolved"
    ? selection.targetMember.parameters[selection.targetParameterIndex] : undefined;
  const expression = use?.kind === "parameter" ? use.expression : use?.kind === "shift-count" ? use.operation.right
    // An element index: the Host outcome is the index argument's own type (the element-access record's index).
    : (selection?.kind === "resolved" || selection?.kind === "project-indexer") &&
      sourceTypeDescriptorsEqual(selection.source.index, outcome.type) ? outcome.provenance.occurrence : undefined;
  const indexType = use?.kind === "shift-count" && shifts.has(use.operation.sourceOperator)
    ? csharpSourceTypeFlowShiftCountType(use.operation) : selection?.kind === "project-indexer" ? selection.keyType : parameter?.type;
  if (expression === undefined || outcome.provenance.occurrence !== expression ||
    indexType === undefined || !targetTypeRefEquals(indexType, target) ||
    parameter !== undefined && parameter.passingMode !== undefined && parameter.passingMode !== "by-value") return undefined;
  return Object.freeze({ kind: "checked-native-integer" });
}
