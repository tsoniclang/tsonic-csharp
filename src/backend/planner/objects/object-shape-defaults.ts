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
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpValueTypeTargetType,
} from "../../../target-model/types/index.js";

export function planObjectShapeDefaultProjection(
  projected: CsharpExpression,
  member: CsharpObjectShapeFact["members"][number],
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
): { readonly expression: CsharpExpression; readonly type: CsharpTypeNode; readonly carrier: CsharpObjectShapeFact["members"][number]["type"] } | undefined {
  if (planDefaultExpressionWithExpectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Object destructuring defaults require the active expression planner before C# emission."));
    return undefined;
  }
  const nullableSourceCarrier = getCsharpNullableElementTargetType(member.type);
  const defaultCarrier = nullableSourceCarrier ?? member.type;
  if (member.optional === true && nullableSourceCarrier === undefined && isCsharpValueTypeTargetType(member.type)) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires optional value-type members to carry a nullable target carrier before C# emission.`));
    return undefined;
  }
  const defaultType = csharpTypeFromTargetTypeRef(defaultCarrier);
  if (defaultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`));
    return undefined;
  }
  const whenFalse = planDefaultExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, defaultType, initializer, state);
  if (whenFalse === undefined) {
    return undefined;
  }
  return {
    expression: nullableSourceCarrier === undefined && member.optional !== true
      ? projected
      : {
          kind: "BinaryExpression",
          left: projected,
          operatorToken: { kind: "QuestionQuestionToken" },
          right: whenFalse,
        },
    type: defaultType,
    carrier: defaultCarrier,
  };
}
