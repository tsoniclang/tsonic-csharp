import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpObjectInitializerAssignment } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { csharpCaptureFrameExpression, csharpCapturedBindingExpression } from "./capture-storage.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { getCsharpLocalBindingName } from "./binding-state.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import { planThisExpression } from "../expressions/expression-this.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";

export function planCsharpFrameClosureReference(
  node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const selected = input.program.captureStorage.closure(node);
  if (selected === undefined) return undefined;
  if (selected.frame.ownership === "value") {
    const type = csharpTypeFromObjectShapeFact(input, selected.frame.shape, diagnostics, node);
    if (type === undefined) return undefined;
    const assignments: CsharpObjectInitializerAssignment[] = [];
    for (const binding of selected.frame.bindings) {
      const name = input.program.source.ast.name(binding.declaration);
      const expression = csharpCapturedBindingExpression(binding.declaration, input, state) ?? (name === undefined ? undefined : {
        kind: "IdentifierName" as const, name: getCsharpLocalBindingName(name, input, state) ??
          requireCsharpIdentifier(input.program.source.ast.text(name), diagnostics, "Captured binding"),
      });
      if (expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(binding.declaration, "A generic callable capture requires its exact source binding access."));
        return undefined;
      }
      assignments.push({ kind: "AssignmentExpression", name: binding.fieldName, expression });
    }
    for (const parent of selected.frame.parents) {
      const expression = csharpCaptureFrameExpression(parent.frame.scope, input, state);
      if (expression === undefined || csharpTypeFromObjectShapeFact(input, parent.frame.shape, diagnostics, node) === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "A generic callable capture requires its exact shared activation frame."));
        return undefined;
      }
      assignments.push({ kind: "AssignmentExpression", name: parent.fieldName, expression });
    }
    for (const receiver of selected.frame.receivers) {
      const reference = receiver.references[0];
      const file = reference === undefined ? undefined : input.program.source.ast.getSourceFile(reference);
      const expression = reference === undefined || file === undefined ? undefined : planThisExpression(reference, file, input, diagnostics);
      if (expression === undefined) return undefined;
      assignments.push({ kind: "AssignmentExpression", name: receiver.fieldName, expression });
    }
    return { kind: "ObjectCreationExpression", type, assignments };
  }
  const receiver = csharpCaptureFrameExpression(selected.frame.scope, input, state);
  if (receiver === undefined || csharpTypeFromObjectShapeFact(input, selected.frame.shape, diagnostics, node) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A native captured callable has no exact activation frame."));
    return undefined;
  }
  return getCsharpMethodValue(selected.method.type) !== undefined ? receiver
    : { kind: "SimpleMemberAccessExpression", receiver, name: selected.method.methodName };
}
