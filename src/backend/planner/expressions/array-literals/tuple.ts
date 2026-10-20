import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { csharpTupleExpression } from "../../types/tuples.js";
import { plannedArrayElements } from "./dense-array.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue } from "../planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planTupleLiteralExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planner: ArrayLiteralPlanner, tupleType: CsharpTypeNode | undefined,
  tupleTarget: Extract<TargetTypeRef, { readonly kind: "tuple" }>): CsharpPlannedValue | undefined {
  const planned = plannedArrayElements(input.program.source.ast.elements(node), sourceFile, input, diagnostics, planner.planExpression);
  if (planned === undefined) return undefined;
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, planned, values => {
    if (tupleType === undefined) failCsharpPlannerInvariant("An admitted tuple requires its exact native tuple type.", node);
    if (values.length === tupleTarget.elements.length) return csharpTupleExpression(values, tupleType);
    const selected = input.program.records.contextualTuple.get(node);
    if (selected?.kind !== "selected") failCsharpPlannerInvariant("An admitted tuple omission requires its exact contextual element inventory.", node);
    const elements = [...values, ...selected.omittedOptionalElementIndexes.map(index => {
      const type = csharpTypeFromTargetTypeRef(tupleTarget.elements[index]!, input.scope.typeParameterNames)
        ?? failCsharpPlannerInvariant("An admitted optional tuple element requires its native type.", node);
      return { kind: "DefaultExpression" as const, type };
    })];
    return csharpTupleExpression(elements, tupleType);
  }, tupleTarget);
}
