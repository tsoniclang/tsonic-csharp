import type { CsharpPlanningContext } from "../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../target-model/conversions/selection.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpUnionPattern } from "./union-patterns.js";

export function planCsharpRuntimeUnionProjection(node: Node, sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
  expression: CsharpExpression, _diagnostics: TargetDiagnostic[], input: CsharpPlanningContext): CsharpExpression {
  const value = planCsharpUnionPattern(expression, selection.path, sourceType, selection.retainsAbsence, input).value;
  if (selection.refinement === undefined) return value;
  const type = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant("An admitted union payload refinement requires its native target type.", node);
  return { kind: "CastExpression", type, expression: value };
}
