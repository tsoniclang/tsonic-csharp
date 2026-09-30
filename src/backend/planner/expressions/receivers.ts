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
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type { CsharpMemberReceiverProjection } from "../../../analysis/operations/index.js";
import { applyCsharpConversionSelection } from "./conversions.js";

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
  projection?: CsharpMemberReceiverProjection,
): CsharpExpression | undefined {
  const expression = planExpression(
    receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  return expression === undefined || projection === undefined ? expression : applyCsharpConversionSelection(
    receiver.expression, sourceFile, input, diagnostics, projection.source, projection.target, projection.conversion, expression,
  );
}
