import {
  AsMethodDeclaration,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  objectShapeStorageMemberName,
} from "./object-shapes.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  planBlockStatements,
} from "./statements.js";
import {
  isAsyncExpression,
  csharpDelegateSignatureFromTargetTypeRef,
  lambdaTargetContextFromTargetRef,
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, input, diagnostics);
  const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method must match a finalized provider object-shape member."));
    return undefined;
  }
  const memberType = csharpTypeFromTargetTypeRef(member.type);
  if (memberType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a renderable delegate target type before C# emission.`));
    return undefined;
  }
  if (csharpDelegateSignatureFromTargetTypeRef(member.type) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a finalized delegate target type before C# emission.`));
    return undefined;
  }
  const expression = planObjectLiteralMethodAsLambda(methodNode, sourceFile, input, diagnostics, memberType, member.type);
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTargetType: Parameters<typeof csharpDelegateSignatureFromTargetTypeRef>[0],
): CsharpExpression | undefined {
  const method = AsMethodDeclaration(methodNode);
  void expectedType;
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
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(methodNode) ? { async: true } : {}),
    parameters: planLambdaParameters(method.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, undefined, lambdaTargetContextFromTargetRef(expectedTargetType)),
    body: {
      kind: "Block",
      statements: planBlockStatements(method.Body, sourceFile, input, diagnostics),
    },
  };
}
