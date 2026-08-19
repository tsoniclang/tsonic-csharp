import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export interface CsharpSelectedReceiverEvidence {
  readonly expression: Node;
  readonly type: Type;
}

export function translateCsharpSelectedReceiver(
  receiver: CsharpSelectedReceiverEvidence,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const selectedType = input.types.resolveSelectedValue(
    receiver.expression,
    receiver.type,
    sourceFile,
  );
  if (selectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      receiver.expression,
      "The exact checker-selected member receiver has no closed C# selected-flow representation.",
    ));
    return undefined;
  }
  return planExpression(
    receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
}
