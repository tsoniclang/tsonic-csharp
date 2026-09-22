import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureFrame } from "../../../../analysis/callables/capture-storage.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpTypeMember } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { createCsharpMemberPlanningContext } from "../../context.js";
import { planArrowFunctionExpression, planFunctionExpression } from "../../expressions/expression-lambdas.js";
import { planExpression, planExpressionWithExpectedType } from "../../expressions/index.js";
import { planTypeParameters } from "../../types/type-parameters.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { getCsharpDelegateSignature, isCsharpVoidTargetType } from "../../../../target-model/types/index.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

export function renderCsharpCaptureFrameMethods(
  shape: CsharpObjectShapeFact, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] | undefined {
  const frame = input.program.captureStorage.forShape(shape.targetType);
  if (frame === undefined) return [];
  const captureFrames = new Map<Node, CsharpExpression>();
  const capturedBindings = new Map<Node, CsharpExpression>();
  const capturedReceivers = new Map<Node, CsharpExpression>();
  const retain = (selected: CsharpCaptureFrame, expression: CsharpExpression): void => {
    captureFrames.set(selected.scope, expression);
    for (const binding of selected.bindings) capturedBindings.set(binding.declaration, {
      kind: "SimpleMemberAccessExpression", receiver: expression, name: binding.fieldName,
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
  for (const method of frame.methods) {
    const signature = getCsharpDelegateSignature(method.type);
    const returnType = signature === undefined ? undefined : csharpTypeFromTargetTypeRef(signature.returnType);
    const file = input.program.source.ast.getSourceFile(method.declaration);
    if (signature === undefined || returnType === undefined || file === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(method.declaration, "A native captured method requires its sealed callable signature."));
      return undefined;
    }
    const context = createCsharpMemberPlanningContext({ ...input, scope: {
      captureFrames, capturedBindings, capturedReceivers, nativeCallableBody: method.declaration,
    } });
    const lambda = input.program.source.ast.is.IsArrowFunction(method.declaration)
      ? planArrowFunctionExpression(method.declaration, file, context, diagnostics, planExpression,
        undefined, undefined, method.type,
        (node, file, input, diagnostics, type, subject, target, state) =>
          planExpressionWithExpectedType(node, file, input, diagnostics, type, subject, state, target))
      : planFunctionExpression(method.declaration, file, context, diagnostics, undefined, undefined, method.type);
    if (lambda?.kind !== "LambdaExpression") return undefined;
    const parameters = lambda.parameters.map((parameter, index) => {
      const type = parameter.type ?? (signature.parameters[index] === undefined ? undefined : csharpTypeFromTargetTypeRef(signature.parameters[index]!));
      return type === undefined ? undefined : { name: parameter.name, type };
    });
    if (parameters.some(parameter => parameter === undefined)) return undefined;
    members.push({ kind: "MethodDeclaration", name: method.methodName,
      modifiers: ["public", ...(lambda.async ? ["async" as const] : [])], returnType,
      typeParameters: planTypeParameters(input.program.source.ast.typeParameters(method.declaration), context, diagnostics),
      parameters: parameters as NonNullable<typeof parameters[number]>[],
      body: lambda.body.kind === "Block" ? lambda.body : { kind: "Block", statements: [
        isCsharpVoidTargetType(signature.returnType) ? { kind: "ExpressionStatement", expression: lambda.body }
          : { kind: "ReturnStatement", expression: lambda.body },
      ] },
    }, ...context.scope.generatedMethods?.values() ?? []);
  }
  return members;
}
