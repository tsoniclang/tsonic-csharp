import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpTypeMember } from "../../target-ast/syntax/index.js";
import type { CsharpPlannedObjectAssignment } from "../expressions/planned-initializers.js";
import type { CsharpPlanningContext } from "../context.js";
import { createCsharpMemberPlanningContext, createCsharpThisBindingPlanningContext } from "../context.js";
import { planMethodDeclaration } from "../declarations/classes/methods.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { csharpTypeFromObjectShapeFact } from "./planning.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpObjectCaptureField } from "../../../target-model/records/objects/object-methods.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import { getCsharpLocalBindingName } from "../bindings/binding-state.js";
import { renderCsharpExplicitImplementationTypeParameters } from "../types/type-parameters.js";
import { csharpCapturedBindingExpression, csharpCaptureFrameExpression } from "../bindings/capture-storage.js";
import { objectShapeArtifactKey } from "../../../target-model/records/objects/object-shape-keys.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import type { CsharpPlannedAddressOperand } from "../expressions/planned-values.js";

export function csharpObjectCaptureFields(shape: CsharpObjectShapeFact, input: CsharpPlanningContext): readonly CsharpObjectCaptureField[] {
  const selected = input.program.records.objectCaptures.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object requires its sealed capture-field inventory.", shape.methodImplementation?.declaration);
  return selected;
}

export function renderCsharpAuthoredObjectMethods(
  shape: CsharpObjectShapeFact, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] | undefined {
  const implementation = shape.methodImplementation;
  if (implementation === undefined) return [];
  const members: CsharpTypeMember[] = [];
  const capturedBindings = new Map<Node, CsharpPlannedAddressOperand>();
  const captureFrames = new Map<Node, CsharpExpression>();
  for (const field of csharpObjectCaptureFields(shape, input)) {
    const type = csharpTypeFromTargetTypeRef(field.type, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted object capture requires its renderable storage carrier.", implementation.declaration);
    const frame = field.frameScope === undefined ? undefined : input.program.records.captureFrame.get(field.frameScope);
    if (frame !== undefined && csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, implementation.declaration) === undefined) return undefined;
    members.push({ kind: "FieldDeclaration", name: field.name, type,
      modifiers: ["public", "required", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, field.name)] });
    const owner: CsharpExpression = { kind: "IdentifierName", name: "this" };
    const receiver: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: owner, name: field.name };
    if (field.frameScope !== undefined) captureFrames.set(field.frameScope, receiver);
    for (const binding of field.declarations) capturedBindings.set(binding.declaration, binding.member === undefined ? {
      expression: receiver, address: { kind: "member", receiver: { expression: owner }, name: field.name, static: false },
    } : {
      expression: { kind: "SimpleMemberAccessExpression", receiver, name: binding.member },
      address: { kind: "member", receiver: { expression: receiver }, name: binding.member, static: false },
    });
  }
  const context = createCsharpThisBindingPlanningContext({ ...input, scope: { ...input.scope, capturedBindings, captureFrames } }, "this", shape.targetType);
  const methods = input.program.records.objectMethods.get(shape);
  if (methods === undefined) failCsharpPlannerInvariant("An admitted object requires its sealed authored-method inventory.", implementation.declaration);
  for (const member of methods) {
    const declaration = member.declaration;
    const sourceFile = input.program.source.ast.getSourceFile(declaration);
    if (sourceFile === undefined) failCsharpPlannerInvariant("An admitted native object method requires its checked source file.", declaration);
    const methodContext = createCsharpMemberPlanningContext(context);
    const method = planMethodDeclaration(declaration, sourceFile, methodContext, diagnostics,
      { kind: "artifact", container: objectShapeArtifactKey(shape), member: member.emission.bodyName, role: "member" });
    const value = member.emission.value;
    members.push({ ...method, name: member.emission.bodyName,
      ...(value.kind === "fixed" ? {} : { modifiers: ["private", ...method.modifiers.filter(modifier =>
        modifier !== "public" && modifier !== "protected" && modifier !== "internal" && modifier !== "private")] }) });
    members.push(...methodContext.scope.generatedMethods?.values() ?? []);
    if (member.bodyInvocation !== undefined) {
      const explicitInterface = csharpTypeFromTargetTypeRef(member.bodyInvocation.interface, input.scope.typeParameterNames);
      if (explicitInterface === undefined) failCsharpPlannerInvariant("An admitted original method body requires its native protocol.", declaration);
      const call: CsharpExpression = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "this" }, name: member.emission.bodyName,
        typeArguments: (method.typeParameters ?? []).map(parameter => ({ kind: "IdentifierName", name: parameter.name })) },
        arguments: method.parameters.map(parameter => ({ kind: "Argument", expression: { kind: "IdentifierName", name: parameter.name },
          ...(parameter.passing === undefined ? {} : { passing: parameter.passing }) })) };
      members.push({ kind: "MethodDeclaration", name: member.bodyInvocation.name, explicitInterface, modifiers: [], returnType: method.returnType,
        ...(method.returnPassing === undefined ? {} : { returnPassing: method.returnPassing }),
        typeParameters: renderCsharpExplicitImplementationTypeParameters(
          (method.typeParameters ?? []).map(parameter => parameter.name), member.bodyInvocation.explicitConstraints),
        parameters: method.parameters.map(({ defaultValue: _default, ...parameter }) => parameter),
        body: { kind: "Block", statements: [member.emission.signature.returnsVoid
          ? { kind: "ExpressionStatement", expression: call }
          : { kind: "ReturnStatement", expression: call, ...(method.returnPassing === undefined ? {} : { ref: true as const }) }] } });
    }
    if (member.handleName !== undefined) {
      const type = csharpTypeFromTargetTypeRef(shape.targetType, input.scope.typeParameterNames);
      if (type === undefined) failCsharpPlannerInvariant("An admitted method handle requires its renderable native carrier.", declaration);
      members.push({ kind: "PropertyDeclaration", name: member.handleName,
        modifiers: ["public", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, member.handleName)], type,
        getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: { kind: "IdentifierName", name: "this" } }] },
      });
    }
  }
  return members;
}

export function planCsharpObjectCaptureAssignments(
  shape: CsharpObjectShapeFact, literal: Node, input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): readonly CsharpPlannedObjectAssignment[] | undefined {
  if (shape.methodImplementation !== undefined && shape.methodImplementation.declaration !== literal) return [];
  const assignments: CsharpPlannedObjectAssignment[] = [];
  for (const field of csharpObjectCaptureFields(shape, input)) {
    const declaration = field.declarations[0]!.declaration;
    let expression: CsharpExpression | undefined;
    if (field.frameScope !== undefined) {
      expression = csharpCaptureFrameExpression(field.frameScope, input, state);
    } else {
      const name = input.program.source.ast.name(declaration);
      expression = csharpCapturedBindingExpression(declaration, input, state);
      if (expression === undefined && name !== undefined) {
        const local = getCsharpLocalBindingName(name, input, state);
        const selected = input.program.records.sourceName.get(name);
        if (local === undefined && selected.kind !== "resolved") failCsharpPlannerInvariant("An admitted object capture requires its native binding name.", declaration);
        expression = { kind: "IdentifierName", name: local === undefined && selected.kind === "resolved" ? selected.name : local! };
      }
    }
    if (expression === undefined) {
      failCsharpPlannerInvariant("A captured object method binding has no sealed native storage access.", declaration);
    }
    assignments.push({ kind: "AssignmentExpression", name: field.name, carrier: field.type, expression });
  }
  return assignments;
}
