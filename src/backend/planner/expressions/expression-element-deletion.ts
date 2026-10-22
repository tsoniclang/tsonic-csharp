import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "./expression-planner-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";

export function planCsharpElementDeletion(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  const selection = input.program.records.elementDeletion.get(node);
  if (selection?.kind !== "resolved") {
    failCsharpPlannerInvariant("An admitted deletion requires its sealed native operation.", node);
  }
  const keyType = csharpTypeFromTargetTypeRef(selection.keyType, input.scope.typeParameterNames);
  const receiver = planExpression(selection.receiver, sourceFile, input, diagnostics);
  const argument = keyType === undefined ? undefined : planCallArgument(selection.index, sourceFile, input, diagnostics, selection.keyType, "by-value");
  if (receiver === undefined || argument === undefined || argument.passing !== undefined)
    failCsharpPlannerInvariant("An admitted deletion requires its native receiver and by-value index.", node);
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [receiver, argument], values => ({ kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: values[0]!, name: selection.targetMemberName },
    arguments: [{ kind: "Argument", expression: values[1]! }] }));
}
