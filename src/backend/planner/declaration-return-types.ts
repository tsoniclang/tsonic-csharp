import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { getCsharpTypeForNode, getCsharpTypeFromSemanticType, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  getTargetTypeRefForNode,
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  getCsharpTaskResultTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnCarrier = input.semantics.getReturnTypeCarrierFromDeclaration(declarationNode, { sourceFile });
    const inferred = returnCarrier === undefined
      ? getCsharpTypeFromInferredSignatureReturnType(declarationNode, sourceFile, input)
      : csharpTypeFromTargetTypeRef(returnCarrier);
    if (inferred === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declarationNode, `C# ${context} emission requires a return type, but the TSTS semantic session did not return a finalized signature return carrier.`));
      return invalidCsharpType(`${context} return type`);
    }
    return inferred;
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

export function getAsyncReturnExpressionExpectedType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly type: ReturnType<typeof getCsharpTypeForNode>; readonly subject?: Node } | undefined {
  const returnTargetType = getDeclarationReturnTargetType(typeNode, declarationNode, sourceFile, input);
  const resultTargetType = getCsharpTaskResultTargetType(returnTargetType);
  if (resultTargetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      typeNode ?? declarationNode,
      `Async C# ${context} emission requires finalized Promise/Task result carrier facts before return expression planning.`,
    ));
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(resultTargetType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      typeNode ?? declarationNode,
      `Async C# ${context} emission requires a renderable Promise/Task result carrier before return expression planning.`,
    ));
    return undefined;
  }
  const subject = getAsyncReturnExpressionSubject(typeNode, input);
  return { type, ...(subject === undefined ? {} : { subject }) };
}

function getCsharpTypeFromInferredSignatureReturnType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const returnType = getInferredSignatureReturnType(declarationNode, sourceFile, input);
  return getCsharpTypeFromSemanticType(returnType, sourceFile, input);
}

function getDeclarationReturnTargetType(
  typeNode: Node | undefined,
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  if (typeNode !== undefined) {
    return getTargetTypeRefForNode(input, typeNode, sourceFile);
  }
  return input.semantics.getReturnTypeCarrierFromDeclaration(declarationNode, { sourceFile }) ??
    getTargetTypeRefForType(input, getInferredSignatureReturnType(declarationNode, sourceFile, input), sourceFile);
}

function getInferredSignatureReturnType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  const declarationType = input.semantics.getTypeAtLocation(declarationNode, { sourceFile });
  const signature = input.types.getCallSignatures(declarationType, { sourceFile })[0];
  return input.types.getReturnTypeOfSignature(signature, { sourceFile });
}

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: TargetCompileInput): Node | undefined {
  const typeArguments = typeNode === undefined ? [] : input.ast.typeArguments(typeNode);
  return typeArguments[0];
}
