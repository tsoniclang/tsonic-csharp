import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpBindingDefaultValue } from "../bindings/optional-values.js";
import type { CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";

export function planObjectShapeDefaultProjection(
  projected: CsharpExpression,
  member: CsharpObjectShapeFact["members"][number],
  contract: CsharpDefaultValueContract,
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner | undefined,
): { readonly value: CsharpPlannedValue; readonly type: CsharpTypeNode; readonly carrier: CsharpObjectShapeFact["members"][number]["type"] } | undefined {
  if (planExpression === undefined) {
    failCsharpPlannerInvariant("Object destructuring defaults require the active expression planner before C# emission.", initializer);
  }
  const defaultCarrier = contract.target;
  const defaultType = csharpTypeFromTargetTypeRef(defaultCarrier, input.scope.typeParameterNames);
  if (defaultType === undefined) {
    failCsharpPlannerInvariant(`Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`, initializer);
  }
  const whenFalse = planExpression(initializer, sourceFile, input, diagnostics, state);
  if (whenFalse === undefined) {
    failCsharpPlannerInvariant("An admitted object member default requires its native initializer value.", initializer);
  }
  const value = planCsharpBindingDefaultValue(initializer, sourceFile, input, diagnostics,
    projected, contract, whenFalse, state);
  if (value === undefined) failCsharpPlannerInvariant("An admitted object member default requires its exact native projection.", initializer);
  return { value, type: defaultType, carrier: defaultCarrier };
}
