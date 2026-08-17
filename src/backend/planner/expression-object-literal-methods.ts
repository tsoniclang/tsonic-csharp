import {
  createCsharpThisBindingTranslationContext,
} from "../../translate/context/index.js";
import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsMethodDeclaration,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../policy/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  objectShapeStorageMemberName,
  objectShapeMethodStorageTargetType,
} from "./object-shapes.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
} from "./bindings.js";
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, input, diagnostics);
  const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method must match a finalized provider object-shape member."));
    return undefined;
  }
  const storageTargetType = objectShapeMethodStorageTargetType(
    objectShape,
    member,
  );
  const storageType = storageTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(storageTargetType);
  const selfType = csharpTypeFromTargetTypeRef(objectShape.targetType);
  if (storageTargetType === undefined || storageType === undefined || selfType === undefined) {
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  expectedTargetType: Parameters<typeof csharpDelegateSignatureFromTargetTypeRef>[0],
  selfType: NonNullable<ReturnType<typeof csharpTypeFromTargetTypeRef>>,
): CsharpExpression | undefined {
  const method = AsMethodDeclaration(methodNode);
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
  const selfName = allocateSyntheticParameter(state);
  const scopedInput = createCsharpThisBindingTranslationContext(
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
      { kind: "Parameter", name: selfName, type: selfType },
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
