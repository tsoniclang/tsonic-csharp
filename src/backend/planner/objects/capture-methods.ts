import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureFrame } from "../../../target-model/records/capture-storage.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpTypeMember } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { createCsharpMemberPlanningContext } from "../context.js";
import { planCsharpArrowLambdaSyntax, planCsharpCapturedFunctionLambdaSyntax } from "../expressions/callable.js";
import { planExpression } from "../expressions/index.js";
import { planTypeParameters } from "../types/type-parameters.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planSourceFunctionDeclaration } from "../declarations/callables/functions.js";
import { withCsharpSafetyModifiers } from "../safety/explicit-safety.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import type { CsharpPlannedAddressOperand } from "../expressions/planned-values.js";
import type { CsharpCaptureMethodEmission } from "../../../target-model/records/capture-methods.js";

export function renderCsharpCaptureFrameMethods(
  shape: CsharpObjectShapeFact, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] | undefined {
  const frame = input.program.records.captureFrameShape.get(shape.targetType);
  if (frame === undefined) return [];
  const captureFrames = new Map<Node, CsharpExpression>();
  const capturedBindings = new Map<Node, CsharpPlannedAddressOperand>();
  const capturedReceivers = new Map<Node, CsharpExpression>();
  const retain = (selected: CsharpCaptureFrame, expression: CsharpExpression): void => {
    captureFrames.set(selected.scope, expression);
    for (const binding of selected.bindings) capturedBindings.set(binding.declaration, {
      expression: { kind: "SimpleMemberAccessExpression", receiver: expression, name: binding.fieldName },
      address: { kind: "member", receiver: { expression }, name: binding.fieldName, static: false },
    });
    for (const receiver of selected.receivers) for (const reference of receiver.references) capturedReceivers.set(reference, {
      kind: "SimpleMemberAccessExpression", receiver: expression, name: receiver.fieldName,
    });
    for (const parent of selected.parents) retain(parent.frame, {
      kind: "SimpleMemberAccessExpression", receiver: expression, name: parent.fieldName,
    });
  };
  retain(frame, { kind: "IdentifierName", name: "this" });
  const members: CsharpTypeMember[] = [];
  const methods = input.program.records.captureMethods.get(shape);
  if (methods === undefined) failCsharpPlannerInvariant("An admitted capture frame requires its sealed native method inventory.", frame.scope);
  const publish = (method: CsharpMethodDeclaration, selected: CsharpCaptureMethodEmission): void => {
    members.push(method);
    for (const contract of selected.protocolMethods) {
      const explicitInterface = csharpTypeFromTargetTypeRef(contract.interface, input.scope.typeParameterNames);
      if (explicitInterface === undefined) failCsharpPlannerInvariant("An admitted captured body requires its renderable native invocation protocol.", selected.method.declaration);
      const call: CsharpExpression = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "this" }, name: method.name,
        typeArguments: method.typeParameters?.map(parameter => ({ kind: "IdentifierName", name: parameter.name })) },
        arguments: method.parameters.map(parameter => ({ kind: "Argument", expression: { kind: "IdentifierName", name: parameter.name },
          ...(parameter.passing === undefined ? {} : { passing: parameter.passing }) })) };
      members.push({ kind: "MethodDeclaration", name: contract.name, explicitInterface, modifiers: [], returnType: method.returnType,
        typeParameters: method.typeParameters?.map(parameter => ({ name: parameter.name })),
        parameters: method.parameters.map(({ defaultValue: _default, ...parameter }) => parameter),
        body: { kind: "Block", statements: [selected.returnsVoid
          ? { kind: "ExpressionStatement", expression: call } : { kind: "ReturnStatement", expression: call }] } });
    }
  };
  for (const selected of methods) {
    const { method, quotation, signature } = selected;
    const returnType = csharpTypeFromTargetTypeRef(selected.returnType, input.scope.typeParameterNames);
    const file = input.program.source.ast.getSourceFile(method.declaration);
    if (returnType === undefined || file === undefined) failCsharpPlannerInvariant("An admitted capture method requires its native return syntax and checked source file.", method.declaration);
    const context = createCsharpMemberPlanningContext({ ...input, scope: { ...input.scope,
      captureFrames, capturedBindings, capturedReceivers,
      nativeCallableBody: { declaration: method.declaration, carrier: method.type },
    } });
    if (selected.form === "declaration") {
      const planned = planSourceFunctionDeclaration(method.declaration, file, context, diagnostics);
      publish({ ...planned.declaration, kind: "MethodDeclaration", name: method.methodName,
        modifiers: withCsharpSafetyModifiers(planned.async
          ? ["public", "async", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, method.methodName)]
          : ["public", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, method.methodName)],
          method.declaration, "declaration", context) }, selected);
      continue;
    }
    const lambda = selected.form === "arrow"
      ? planCsharpArrowLambdaSyntax(method.declaration, file, context, diagnostics, planExpression)
      : planCsharpCapturedFunctionLambdaSyntax(method.declaration, file, context, diagnostics);
    if (lambda === undefined) failCsharpPlannerInvariant("An admitted captured callable requires its native body fragments.", method.declaration);
    if (quotation) {
      publish({ kind: "MethodDeclaration", name: method.methodName,
        modifiers: ["public", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, method.methodName)], returnType,
        parameters: [], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: lambda }] },
      }, selected);
      members.push(...context.scope.generatedMethods?.values() ?? []);
      continue;
    }
    const parameters = lambda.parameters.map((parameter, index) => {
      const type = parameter.type ?? (signature.parameters[index] === undefined ? undefined : csharpTypeFromTargetTypeRef(signature.parameters[index]!, input.scope.typeParameterNames));
      if (type === undefined) failCsharpPlannerInvariant("An admitted captured parameter requires its native carrier syntax.", method.declaration);
      return { name: parameter.name, type,
        ...(signature.restParameterIndex === index ? { isParams: true } : {}),
        ...(signature.optionalParameterIndexes?.includes(index)
          ? { defaultValue: { kind: "DefaultExpression" as const, type } } : {}),
      };
    });
    publish({ kind: "MethodDeclaration", name: method.methodName,
      modifiers: ["public", ...(lambda.async ? ["async" as const] : []),
        ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, method.methodName)], returnType,
      typeParameters: planTypeParameters(input.program.source.ast.typeParameters(method.declaration), context, diagnostics),
      parameters,
      body: lambda.body.kind === "Block" ? lambda.body : { kind: "Block", statements: [
        selected.returnsVoid ? { kind: "ExpressionStatement", expression: lambda.body }
          : { kind: "ReturnStatement", expression: lambda.body },
      ] },
    }, selected);
    members.push(...context.scope.generatedMethods?.values() ?? []);
  }
  return members;
}
