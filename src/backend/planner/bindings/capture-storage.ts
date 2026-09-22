import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureFrame } from "../../../analysis/callables/capture-storage.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { csharpCaptureFrameName, getCsharpLocalBindingName } from "./binding-state.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planThisExpression } from "../expressions/expression-this.js";

export function csharpCaptureFrameExpression(
  scope: Node, input: CsharpPlanningContext, state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  return input.scope.captureFrames?.get(scope) ?? (state === undefined ? undefined : {
    kind: "IdentifierName", name: csharpCaptureFrameName(scope, state),
  });
}

export function csharpCapturedBindingExpression(
  declaration: Node, input: CsharpPlanningContext, state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const override = input.scope.capturedBindings?.get(declaration);
  if (override !== undefined) return override;
  const selected = input.program.captureStorage.binding(declaration);
  const receiver = selected === undefined ? undefined : csharpCaptureFrameExpression(selected.frame.scope, input, state);
  return selected === undefined || receiver === undefined ? undefined : {
    kind: "SimpleMemberAccessExpression", receiver, name: selected.fieldName,
  };
}

export function planCsharpCaptureFrame(
  scope: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
  incoming: ReadonlyMap<Node, CsharpExpression> = new Map(),
): readonly CsharpStatement[] {
  const frame = input.program.captureStorage.frame(scope);
  if (frame === undefined) return [];
  const type = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, scope);
  if (type === undefined) return [];
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const binding of frame.bindings) {
    const bindingType = csharpTypeFromTargetTypeRef(binding.type);
    if (bindingType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(binding.declaration,
        "A captured binding requires a renderable sealed physical storage type."));
      return [];
    }
    assignments.push({ kind: "AssignmentExpression", name: binding.fieldName,
      expression: incoming.get(binding.declaration) ?? { kind: "DefaultExpression", type: bindingType, nullForgiving: true },
    });
  }
  for (const parent of frame.parents) {
    const expression = csharpCaptureFrameExpression(parent.frame.scope, input, state);
    if (expression === undefined || csharpTypeFromObjectShapeFact(input, parent.frame.shape, diagnostics, scope) === undefined) return [];
    assignments.push({ kind: "AssignmentExpression", name: parent.fieldName, expression });
  }
  for (const receiver of frame.receivers) {
    const reference = receiver.references[0]!;
    const file = input.program.source.ast.getSourceFile(reference);
    const expression = file === undefined ? undefined : planThisExpression(reference, file, input, diagnostics);
    if (expression === undefined) return [];
    assignments.push({ kind: "AssignmentExpression", name: receiver.fieldName, expression });
  }
  return [{ kind: "LocalDeclarationStatement", name: csharpCaptureFrameName(scope, state), type,
    initializer: { kind: "ObjectCreationExpression", type, assignments } }];
}

export function planCsharpCaptureEntryBindings(
  scope: Node, input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const owner = input.program.source.ast.parent(scope);
  const frame = input.program.captureStorage.frame(scope);
  if (frame === undefined || owner === undefined) return [];
  return frame.bindings.flatMap(binding => {
    if (input.program.source.ast.parent(binding.declaration) !== owner ||
      (!input.program.source.ast.is.IsParameterDeclaration(binding.declaration) && !input.program.source.ast.is.IsCatchClause(owner))) return [];
    const name = input.program.source.ast.name(binding.declaration);
    const localName = name === undefined ? undefined : getCsharpLocalBindingName(name, input, state);
    if (localName === undefined) return [];
    const statement = planCsharpCapturedInitialization(binding.declaration, { kind: "IdentifierName", name: localName }, input, state);
    return statement === undefined ? [] : [statement];
  });
}

export function planCsharpCaptureFrameRotation(
  frame: CsharpCaptureFrame, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const type = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, frame.scope);
  if (type === undefined) return undefined;
  const receiver: CsharpExpression = { kind: "IdentifierName", name: csharpCaptureFrameName(frame.scope, state) };
  return { kind: "AssignmentExpression", left: receiver, operatorToken: { kind: "EqualsToken" }, right: {
    kind: "ObjectCreationExpression", type, assignments: frame.shape.members.map(member => ({
      kind: "AssignmentExpression", name: member.targetName,
      expression: { kind: "SimpleMemberAccessExpression", receiver, name: member.targetName },
    })),
  } };
}

export function planCsharpCapturedInitialization(
  declaration: Node, initializer: CsharpExpression | undefined, input: CsharpPlanningContext, state: DestructuringPlannerState,
): CsharpStatement | undefined {
  const target = csharpCapturedBindingExpression(declaration, input, state);
  if (target === undefined || initializer === undefined) return undefined;
  return { kind: "ExpressionStatement", expression: {
    kind: "AssignmentExpression", left: target, operatorToken: { kind: "EqualsToken" },
    right: initializer,
  } };
}
