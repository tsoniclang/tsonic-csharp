import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpNamedSelfBinding } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { csharpCaptureFrameExpression, csharpCapturedBindingExpression } from "./capture-storage.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { allocateExpressionTemp, getCsharpLocalBindingName } from "./binding-state.js";
import { planCapturedReceiverOwnerValue } from "../expressions/expression-this.js";
import type { CsharpPlannedAddressOperand, CsharpPlannedCallableReference } from "../expressions/planned-values.js";

export function planCsharpNamedSelfCaptureContext(
  self: CsharpNamedSelfBinding, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): { readonly context: CsharpPlanningContext; readonly prelude: readonly CsharpStatement[] } | undefined {
  let captureFrames: Map<Node, CsharpExpression> | undefined;
  let capturedBindings: Map<Node, CsharpPlannedAddressOperand> | undefined;
  const prelude: CsharpStatement[] = [];
  for (const declaration of self.captures) {
    const frame = input.program.records.capturedBinding.get(declaration)?.frame;
    if (frame === undefined || (captureFrames ?? input.scope.captureFrames)?.has(frame.scope)) continue;
    const initializer = csharpCaptureFrameExpression(frame.scope, input, state);
    const type = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, self.declaration);
    if (initializer === undefined || type === undefined) {
      failCsharpPlannerInvariant("A named self callable requires its exact captured activation frame.", self.declaration);
    }
    const name = allocateExpressionTemp(state);
    const retained: CsharpExpression = { kind: "IdentifierName", name };
    prelude.push({ kind: "LocalDeclarationStatement", name, type, initializer });
    captureFrames ??= new Map(input.scope.captureFrames);
    capturedBindings ??= new Map(input.scope.capturedBindings);
    captureFrames.set(frame.scope, retained);
    for (const binding of frame.bindings) capturedBindings.set(binding.declaration, {
      expression: { kind: "SimpleMemberAccessExpression", receiver: retained, name: binding.fieldName },
      address: { kind: "member", receiver: { expression: retained }, name: binding.fieldName, static: false },
    });
  }
  return { context: captureFrames === undefined ? input : {
    ...input, scope: { ...input.scope, captureFrames, capturedBindings },
  }, prelude };
}

export function planCsharpFrameClosureReference(
  node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): CsharpPlannedCallableReference | undefined {
  const selected = input.program.records.captureClosure.get(node);
  if (selected === undefined) return undefined;
  if (selected.frame.ownership === "activation") {
    if (!selected.frame.protocols.some(protocol => protocol.kind === "class")) {
      failCsharpPlannerInvariant("An admitted captured method requires its completed class construction protocol.", node);
    }
    const receiver = csharpCaptureFrameExpression(selected.frame.scope, input, state);
    if (receiver === undefined || csharpTypeFromObjectShapeFact(input, selected.frame.shape, diagnostics, node) === undefined) {
      failCsharpPlannerInvariant("A class construction callback requires its exact shared native place.", node);
    }
    return { expression: { kind: "SimpleMemberAccessExpression", receiver, name: selected.method.methodName },
      callable: { kind: "captured-method", receiver, name: selected.method.methodName } };
  }
  {
    const retained = input.scope.captureFrames?.get(selected.frame.scope);
    if (retained !== undefined) return { expression: retained };
    const type = csharpTypeFromObjectShapeFact(input, selected.frame.shape, diagnostics, node);
    if (type === undefined) failCsharpPlannerInvariant("An admitted value-owned callable requires its native environment storage.", node);
    const assignments: CsharpObjectInitializerAssignment[] = [];
    for (const binding of selected.frame.bindings) {
      const name = input.program.source.ast.name(binding.declaration);
      let expression = csharpCapturedBindingExpression(binding.declaration, input, state);
      if (expression === undefined && name !== undefined) {
        const local = getCsharpLocalBindingName(name, input, state);
        const selectedName = input.program.records.sourceName.get(name);
        if (local === undefined && selectedName.kind !== "resolved") failCsharpPlannerInvariant("An admitted captured binding requires its sealed native name.", binding.declaration);
        expression = { kind: "IdentifierName", name: local === undefined && selectedName.kind === "resolved" ? selectedName.name : local! };
      }
      if (expression === undefined) {
        failCsharpPlannerInvariant("A generic callable capture requires its exact source binding access.", binding.declaration);
      }
      assignments.push({ kind: "AssignmentExpression", name: binding.fieldName, expression });
    }
    for (const parent of selected.frame.parents) {
      const expression = csharpCaptureFrameExpression(parent.frame.scope, input, state);
      if (expression === undefined || csharpTypeFromObjectShapeFact(input, parent.frame.shape, diagnostics, node) === undefined) {
        failCsharpPlannerInvariant("A generic callable capture requires its exact shared activation frame.", node);
      }
      assignments.push({ kind: "AssignmentExpression", name: parent.fieldName, expression });
    }
    for (const receiver of selected.frame.receivers) {
      const reference = receiver.references[0];
      const expression = reference === undefined ? undefined : planCapturedReceiverOwnerValue(reference, input);
      if (expression === undefined) failCsharpPlannerInvariant("An admitted callable capture requires its exact native receiver.", node);
      assignments.push({ kind: "AssignmentExpression", name: receiver.fieldName, expression });
    }
    return { expression: { kind: "ObjectCreationExpression", type, assignments } };
  }
}
