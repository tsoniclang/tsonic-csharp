import {
  HasSourceKind,
  KindNeverKeyword,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { getCsharpTypeForNode, invalidCsharpType, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { getTargetTypeRefForType } from "./runtime-carriers.js";
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
    const returnCarrier = getInferredReturnTypeCarrier(declarationNode, sourceFile, input) ??
      input.semantics.getReturnTypeCarrierFromDeclaration(declarationNode, { sourceFile });
    if (returnCarrier === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declarationNode, `C# ${context} emission requires a return type, but TSTS did not return an inferred signature return type.`));
      return invalidCsharpType(`${context} return type`);
    }
    const inferred = csharpTypeFromTargetTypeRef(returnCarrier);
    return inferred ?? invalidCsharpType(`${context} return type`);
  }
  if (HasSourceKind(input.ast, typeNode, KindNeverKeyword)) {
    return predefined("void");
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

function getInferredReturnTypeCarrier(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  const name = input.ast.name(declarationNode);
  const symbol = input.semantics.getSymbolAtLocation(name ?? declarationNode, { sourceFile });
  const candidateTypes = [
    input.semantics.getTypeOfSymbol(symbol, { sourceFile }),
    name === undefined ? undefined : input.semantics.getTypeAtLocation(name, { sourceFile }),
    input.semantics.getTypeAtLocation(declarationNode, { sourceFile }),
  ];
  for (const declarationType of candidateTypes) {
    const signature = input.types.getCallSignatures(declarationType, { sourceFile })[0];
    const returnType = input.types.getReturnTypeOfSignature(signature, { sourceFile });
    const carrier = getTargetTypeRefForType(input, returnType, sourceFile);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}
