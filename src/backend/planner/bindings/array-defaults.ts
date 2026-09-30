import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArrayBindingCarrier, TargetTypeRef } from "../../../target-model/types/index.js";
import { csharpBindingDefaultCarrier } from "../../../target-model/types/binding-normalization.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { planCsharpArrayBindingPresence, planCsharpBindingDefaultValue } from "./optional-values.js";

export function planArrayDefaultProjection(
  sourceExpression: CsharpExpression,
  index: number,
  projected: CsharpExpression,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpression: BindingDefaultExpressionPlanner,
): { readonly expression: CsharpExpression; readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode } | undefined {
  const defaultCarrier = input.program.sourceEvidence.nodeTargetType(initializer);
  const carrier = defaultCarrier === undefined ? undefined : csharpBindingDefaultCarrier(sourceCarrier.element, defaultCarrier);
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (carrier === undefined || type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Array default requires a renderable finalized element carrier."));
    return undefined;
  }
  const defaultValue = planDefaultExpression(initializer, sourceFile, input, diagnostics, type, initializer, state, carrier);
  if (defaultValue === undefined) return undefined;
  const presentValue = planCsharpBindingDefaultValue(projected, sourceCarrier.element, defaultValue, carrier, state);
  return {
    carrier, type,
    expression: {
      kind: "ConditionalExpression",
      condition: planCsharpArrayBindingPresence(sourceExpression, index, sourceCarrier.lengthMember),
      whenTrue: presentValue,
      whenFalse: defaultValue,
    },
  };
}
