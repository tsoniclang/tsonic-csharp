import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpTypeMember } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { createCsharpMemberPlanningContext, createCsharpThisBindingPlanningContext } from "../../context.js";
import { planMethodDeclaration } from "../../declarations/declaration-class-methods.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { csharpTypeFromObjectShapeFact } from "../planning.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { csharpCapturedBindingExpression, csharpCaptureFrameExpression } from "../../bindings/capture-storage.js";
import { requireCsharpIdentifier } from "../../../../target-model/names/identifiers.js";

interface ObjectCaptureField {
  readonly name: string;
  readonly type: TargetTypeRef;
  readonly declarations: readonly { readonly declaration: Node; readonly member?: string }[];
  readonly frameScope?: Node;
}

function objectCaptureFields(shape: CsharpObjectShapeFact, input: CsharpPlanningContext): readonly ObjectCaptureField[] {
  const fields: ObjectCaptureField[] = [];
  const frames = new Map<Node, number>();
  for (const capture of shape.methodImplementation?.captures ?? []) {
    const selected = input.program.captureStorage.binding(capture.declaration);
    if (selected === undefined) {
      fields.push({ name: capture.fieldName, type: input.program.captureStorage.physicalType(capture.declaration, capture.type),
        declarations: [{ declaration: capture.declaration }] });
      continue;
    }
    const index = frames.get(selected.frame.scope);
    const binding = { declaration: capture.declaration, member: selected.fieldName };
    if (index !== undefined) {
      const field = fields[index]!;
      fields[index] = { ...field, declarations: [...field.declarations, binding] };
    } else {
      frames.set(selected.frame.scope, fields.length);
      fields.push({ name: capture.fieldName, type: selected.frame.shape.targetType,
        frameScope: selected.frame.scope, declarations: [binding] });
    }
  }
  return fields;
}

export function renderCsharpGenericObjectMethods(
  shape: CsharpObjectShapeFact, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] | undefined {
  const implementation = shape.methodImplementation;
  if (implementation === undefined) return [];
  const members: CsharpTypeMember[] = [];
  const capturedBindings = new Map<Node, CsharpExpression>();
  const captureFrames = new Map<Node, CsharpExpression>();
  for (const field of objectCaptureFields(shape, input)) {
    const type = csharpTypeFromTargetTypeRef(field.type);
    if (type === undefined) return undefined;
    const frame = field.frameScope === undefined ? undefined : input.program.captureStorage.frame(field.frameScope);
    if (frame !== undefined && csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, implementation.declaration) === undefined) return undefined;
    members.push({ kind: "FieldDeclaration", name: field.name, type, modifiers: ["public", "required"] });
    const receiver: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: field.name };
    if (field.frameScope !== undefined) captureFrames.set(field.frameScope, receiver);
    for (const binding of field.declarations) capturedBindings.set(binding.declaration, binding.member === undefined ? receiver
      : { kind: "SimpleMemberAccessExpression", receiver, name: binding.member });
  }
  const context = createCsharpThisBindingPlanningContext({ ...input, scope: { capturedBindings, captureFrames } }, "this", shape.targetType);
  for (const member of shape.members) {
    if ((member.typeParameters?.length ?? 0) === 0) continue;
    const declarations = (member.sourceDeclarations ?? []).filter(declaration =>
      input.program.source.ast.parent(declaration) === implementation.declaration && input.program.source.ast.body(declaration) !== undefined);
    if (declarations.length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(implementation.declaration, "A native generic object method requires its exact authored implementation."));
      return undefined;
    }
    const declaration = declarations[0]!;
    const sourceFile = input.program.source.ast.getSourceFile(declaration);
    if (sourceFile === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration, "A generic object method requires its exact checked source file."));
      return undefined;
    }
    const methodContext = createCsharpMemberPlanningContext(context);
    const method = planMethodDeclaration(declaration, sourceFile, methodContext, diagnostics);
    members.push({ ...method, name: member.targetName });
    members.push(...methodContext.scope.generatedMethods?.values() ?? []);
  }
  return members;
}

export function planCsharpObjectCaptureAssignments(
  shape: CsharpObjectShapeFact, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): readonly CsharpObjectInitializerAssignment[] | undefined {
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const field of objectCaptureFields(shape, input)) {
    const declaration = field.declarations[0]!.declaration;
    let expression: CsharpExpression | undefined;
    if (field.frameScope !== undefined) {
      const forwarded = input.scope.capturedBindings?.get(declaration);
      expression = input.scope.captureFrames?.get(field.frameScope) ?? (forwarded?.kind === "SimpleMemberAccessExpression"
        ? forwarded.receiver : csharpCaptureFrameExpression(field.frameScope, input, state));
    } else {
      const name = input.program.source.ast.name(declaration);
      expression = csharpCapturedBindingExpression(declaration, input, state) ?? (name === undefined ? undefined : {
        kind: "IdentifierName", name: getCsharpLocalBindingName(name, input, state) ??
          requireCsharpIdentifier(input.program.source.ast.text(name), diagnostics, "Captured binding"),
      });
    }
    if (expression === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration, "A captured object method binding has no sealed native storage access."));
      return undefined;
    }
    assignments.push({ kind: "AssignmentExpression", name: field.name, expression });
  }
  return assignments;
}
