import {
  createCsharpThisBindingPlanningContext,
} from "../context.js";
import type { CsharpPlanningContext } from "../context.js";
import { AsMethodDeclaration } from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { sourceCallableUsesLexicalThis } from "@tsonic/target-api/source";
import { type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
} from "../../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../../policy/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  objectShapeStorageMemberName,
  objectShapeMethodStorageTargetType,
} from "../objects/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
} from "../bindings/index.js";
import {
  isAsyncExpression,
  csharpDelegateSignatureFromTargetTypeRef,
  lambdaTargetContextFromTargetRef,
  planLambdaBlockBody,
  planLambdaParameters,
} from "./expression-lambdas.js";
import {
  findObjectShapeMember,
  getObjectLiteralPropertySourceName,
} from "./expression-object-literal-support.js";

export function planObjectShapeMethodMemberAssignment(
  methodNode: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, input, diagnostics);
  const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method must match a finalized provider object-shape member."));
    return undefined;
  }
  const usesLexicalThis = sourceCallableUsesLexicalThis(input.ast, methodNode);
  if (usesLexicalThis && member.memberKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(
      methodNode,
      `Object literal callable property '${member.sourceName}' cannot bind lexical 'this' without an exact receiver-bearing method contract.`,
    ));
    return undefined;
  }
  if (usesLexicalThis) {
    const required = input.artifacts.requireObjectShapeMethodReceiver(
      objectShape,
      member,
    );
    if (required.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(methodNode, required.reason));
      return undefined;
    }
  }
  const receiverBound = member.memberKind === "method" &&
    input.artifacts.objectShapeMethodUsesReceiver(objectShape, member);
  const storageTargetType = member.memberKind === "method"
    ? objectShapeMethodStorageTargetType(
        objectShape,
        member,
        receiverBound,
      )
    : member.type;
  const storageType = storageTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(storageTargetType);
  const selfType = receiverBound
    ? csharpTypeFromTargetTypeRef(objectShape.targetType)
    : undefined;
  if (
    storageTargetType === undefined ||
    storageType === undefined ||
    (receiverBound && selfType === undefined)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a renderable delegate target type before C# emission.`));
    return undefined;
  }
  if (csharpDelegateSignatureFromTargetTypeRef(member.type) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a finalized delegate target type with explicit return facts before C# emission.`));
    return undefined;
  }
  const expression = planObjectLiteralMethodAsLambda(
    methodNode,
    sourceFile,
    input,
    diagnostics,
    objectShape,
    member.type,
    selfType,
  );
  if (expression === undefined) {
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    name: objectShapeStorageMemberName(objectShape, member),
    expression,
  };
}

function planObjectLiteralMethodAsLambda(
  methodNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  expectedTargetType: Parameters<typeof csharpDelegateSignatureFromTargetTypeRef>[0],
  selfType: ReturnType<typeof csharpTypeFromTargetTypeRef>,
): CsharpExpression | undefined {
  const method = AsMethodDeclaration(input.ast, methodNode);
  if (method === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method-declaration AST node."));
    return undefined;
  }
  if ((method.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal generic methods require finalized target delegate facts before C# emission."));
    return undefined;
  }
  if (method.Body === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method body."));
    return undefined;
  }
  const state = createDestructuringPlannerState(methodNode, input.ast);
  const selfName = selfType === undefined
    ? undefined
    : allocateSyntheticParameter(state);
  const scopedInput = selfName === undefined
    ? input
    : createCsharpThisBindingPlanningContext(
        input,
        selfName,
        objectShape.targetType,
      );
  const targetContext = lambdaTargetContextFromTargetRef(expectedTargetType);
  const body = planLambdaBlockBody(
    methodNode,
    method.Body,
    sourceFile,
    scopedInput,
    diagnostics,
    state,
    targetContext,
  );
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.ast, methodNode) ? { async: true } : {}),
    parameters: [
      ...(selfName === undefined || selfType === undefined
        ? []
        : [{ kind: "Parameter" as const, name: selfName, type: selfType }]),
      ...planLambdaParameters(
        method.Parameters?.Nodes ?? [],
        sourceFile,
        scopedInput,
        diagnostics,
        state,
        targetContext,
      ),
    ],
    body,
  };
}
