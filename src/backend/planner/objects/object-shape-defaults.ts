import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import type { BindingDefaultExpressionPlanner } from "../bindings/binding-array-patterns.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpBindingDefaultValue } from "../bindings/optional-values.js";
import { csharpBindingDefaultCarrier } from "../../../target-model/types/binding-normalization.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpValueTypeTargetType,
} from "../../../target-model/types/index.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";

export function planObjectShapeDefaultProjection(
  projected: CsharpExpression,
  member: CsharpObjectShapeFact["members"][number],
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
): { readonly value: CsharpPlannedValue; readonly type: CsharpTypeNode; readonly carrier: CsharpObjectShapeFact["members"][number]["type"] } | undefined {
  if (planDefaultExpressionWithExpectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Object destructuring defaults require the active expression planner before C# emission."));
    return undefined;
  }
  const nullableSourceCarrier = getCsharpNullableElementTargetType(member.type);
  const initializerCarrier = input.program.sourceEvidence.nodeTargetType(initializer);
  const defaultCarrier = initializerCarrier === undefined ? undefined : csharpBindingDefaultCarrier(member.type, initializerCarrier);
  if (member.optional === true && nullableSourceCarrier === undefined && isCsharpValueTypeTargetType(member.type)) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires optional value-type members to carry a nullable target carrier before C# emission.`));
    return undefined;
  }
  const defaultType = defaultCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(defaultCarrier, input.scope.typeParameterNames);
  if (defaultType === undefined || defaultCarrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`));
    return undefined;
  }
  const whenFalse = planDefaultExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, defaultType, initializer, state, defaultCarrier);
  if (whenFalse === undefined) {
    return undefined;
  }
  const value = planCsharpBindingDefaultValue(initializer, sourceFile, input, diagnostics,
    projected, member.type, whenFalse, defaultCarrier, state);
  return value === undefined ? undefined : { value, type: defaultType, carrier: defaultCarrier };
}
