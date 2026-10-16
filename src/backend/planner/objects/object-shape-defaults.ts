import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpBindingDefaultValue } from "../bindings/optional-values.js";
import type { CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpValueTypeTargetType,
} from "../../../target-model/types/index.js";
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
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Object destructuring defaults require the active expression planner before C# emission."));
    return undefined;
  }
  const nullableSourceCarrier = getCsharpNullableElementTargetType(member.type);
  const defaultCarrier = contract.target;
  if (member.optional === true && nullableSourceCarrier === undefined && isCsharpValueTypeTargetType(member.type)) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires optional value-type members to carry a nullable target carrier before C# emission.`));
    return undefined;
  }
  const defaultType = csharpTypeFromTargetTypeRef(defaultCarrier, input.scope.typeParameterNames);
  if (defaultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`));
    return undefined;
  }
  const whenFalse = planExpression(initializer, sourceFile, input, diagnostics, state);
  if (whenFalse === undefined) {
    return undefined;
  }
  const value = planCsharpBindingDefaultValue(initializer, sourceFile, input, diagnostics,
    projected, contract, whenFalse, state);
  return value === undefined ? undefined : { value, type: defaultType, carrier: defaultCarrier };
}
