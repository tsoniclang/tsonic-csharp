import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { csharpCaptureFrameExpression } from "./capture-storage.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpFrameClosureReference(
  node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const selected = input.program.captureStorage.closure(node);
  if (selected === undefined) return undefined;
  const receiver = csharpCaptureFrameExpression(selected.frame.scope, input, state);
  if (receiver === undefined || csharpTypeFromObjectShapeFact(input, selected.frame.shape, diagnostics, node) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A native captured callable has no exact activation frame."));
    return undefined;
  }
  return { kind: "SimpleMemberAccessExpression", receiver, name: selected.method.methodName };
}
