import {
  HasSourceKind,
  KindNeverKeyword,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { getCsharpTypeForNode, invalidCsharpType, predefined } from "./csharp-types.js";
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
    if (returnCarrier === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declarationNode, `C# ${context} emission requires a return type, but the TSTS semantic session did not return a finalized signature return carrier.`));
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
