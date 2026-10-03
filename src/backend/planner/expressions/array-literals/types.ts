import type {
  CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import type { CsharpPlannedValue } from "../planned-values.js";

export interface ArrayLiteralPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpPlannedValue | undefined;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
    expectedTypeSubject?: Node,
    expectedTargetType?: TargetTypeRef,
  ) => CsharpPlannedValue | undefined;
}
