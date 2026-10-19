import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArrayBindingCarrier, TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { planCsharpArrayBindingPresence, planCsharpBindingDefaultValue } from "./optional-values.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";

export function planArrayDefaultProjection(
  sourceExpression: CsharpExpression,
  index: number,
  projected: CsharpExpression,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
  contract: CsharpDefaultValueContract,
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
): { readonly value: CsharpPlannedValue; readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode } | undefined {
  const carrier = contract.target;
  const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (type === undefined) {
    failCsharpPlannerInvariant("An admitted array default lost its native element rendering.", initializer);
  }
  const defaultValue = planExpression(initializer, sourceFile, input, diagnostics, state);
  if (defaultValue === undefined) return undefined;
  const value = planCsharpBindingDefaultValue(initializer, sourceFile, input, diagnostics,
    projected, contract, defaultValue, state,
    planCsharpArrayBindingPresence(sourceExpression, index, sourceCarrier.lengthMember));
  return value === undefined ? undefined : { carrier, type, value };
}
