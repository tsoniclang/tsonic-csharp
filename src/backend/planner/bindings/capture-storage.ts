import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureFrame } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { csharpCaptureFrameName, getCsharpLocalBindingName } from "./binding-state.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCapturedReceiverOwnerValue } from "../expressions/expression-this.js";

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
  if (override !== undefined) return override.expression;
  const selected = input.program.records.capturedBinding.get(declaration);
  const receiver = selected === undefined ? undefined : csharpCaptureFrameExpression(selected.frame.scope, input, state);
  return selected === undefined || receiver === undefined ? undefined : {
    kind: "SimpleMemberAccessExpression", receiver, name: selected.fieldName,
  };
}

export function planCsharpCaptureFrame(
  scope: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
  incoming: ReadonlyMap<Node, CsharpExpression> = new Map(),
  receivers: ReadonlyMap<Node, CsharpExpression> = new Map(),
): readonly CsharpStatement[] {
  if (input.scope.captureFrames?.has(scope)) return [];
  const frame = input.program.records.captureFrame.get(scope);
  if (frame === undefined) return [];
  const type = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, scope);
  if (type === undefined) failCsharpPlannerInvariant("An admitted native capture frame requires its exact storage rendering.", scope);
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const binding of frame.bindings) {
    if (binding.initialization === "deferred") continue;
    const bindingType = csharpTypeFromTargetTypeRef(binding.type, input.scope.typeParameterNames);
    if (bindingType === undefined) {
      failCsharpPlannerInvariant("A captured binding requires a renderable sealed physical storage type.", binding.declaration);
    }
    assignments.push({ kind: "AssignmentExpression", name: binding.fieldName,
      expression: incoming.get(binding.declaration) ?? { kind: "DefaultExpression", type: bindingType, nullForgiving: true },
    });
  }
  for (const parent of frame.parents) {
    const expression = csharpCaptureFrameExpression(parent.frame.scope, input, state);
    if (expression === undefined || csharpTypeFromObjectShapeFact(input, parent.frame.shape, diagnostics, scope) === undefined)
      failCsharpPlannerInvariant("An admitted capture frame requires its exact native parent frame.", scope);
    assignments.push({ kind: "AssignmentExpression", name: parent.fieldName, expression });
  }
  for (const receiver of frame.receivers) {
    const reference = receiver.references[0]!;
    const expression = receivers.get(receiver.owner) ?? planCapturedReceiverOwnerValue(reference, input);
    if (expression === undefined) failCsharpPlannerInvariant("An admitted capture receiver requires its exact native value.", reference);
    assignments.push({ kind: "AssignmentExpression", name: receiver.fieldName, expression });
  }
  return [{ kind: "LocalDeclarationStatement", name: csharpCaptureFrameName(scope, state), type,
    initializer: { kind: "ObjectCreationExpression", type, assignments } }];
}

export function planCsharpCaptureEntryBindings(
  scope: Node, input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const owner = input.program.source.ast.parent(scope);
  const frame = input.program.records.captureFrame.get(scope);
  if (frame === undefined || owner === undefined || !input.program.source.ast.is.IsCatchClause(owner)) return [];
  return frame.bindings.flatMap(binding => {
    if (input.program.source.ast.parent(binding.declaration) !== owner ||
      !input.program.source.ast.is.IsCatchClause(owner)) return [];
    const name = input.program.source.ast.name(binding.declaration);
    const localName = name === undefined ? undefined : getCsharpLocalBindingName(name, input, state);
    if (localName === undefined) failCsharpPlannerInvariant("An admitted captured catch binding requires its native local name.", binding.declaration);
    const statement = planCsharpCapturedInitialization(binding.declaration, { kind: "IdentifierName", name: localName }, input, state);
    if (statement === undefined) failCsharpPlannerInvariant("An admitted captured catch binding requires its native initialization.", binding.declaration);
    return [statement];
  });
}

export function planCsharpParameterCapture(
  declaration: Node, input: CsharpPlanningContext, state: DestructuringPlannerState,
): CsharpStatement | undefined {
  const name = input.program.source.ast.name(declaration);
  const localName = name === undefined ? undefined : getCsharpLocalBindingName(name, input, state);
  return localName === undefined ? undefined : planCsharpCapturedInitialization(declaration,
    { kind: "IdentifierName", name: localName }, input, state);
}

export function planCsharpProtocolFrameRotation(
  frame: CsharpCaptureFrame, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (frame.protocols.length === 0) failCsharpPlannerInvariant("A rotated native place requires its completed class or quantified protocol.", frame.scope);
  const type = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, frame.scope);
  if (type === undefined) failCsharpPlannerInvariant("An admitted capture activation requires its native rotation storage.", frame.scope);
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
