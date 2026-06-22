import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { getCsharpTypeForNode, getCsharpTypeFromSemanticType, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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

function getCsharpTypeFromInferredSignatureReturnType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const declarationType = input.semantics.getTypeAtLocation(declarationNode, { sourceFile });
  const signature = input.types.getCallSignatures(declarationType, { sourceFile })[0];
  const returnType = input.types.getReturnTypeOfSignature(signature, { sourceFile });
  return getCsharpTypeFromSemanticType(returnType, sourceFile, input);
}
