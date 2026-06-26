import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  getTargetTypeRefForNode,
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
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
    const returnCarrierResolution = input.targetFacts.resolveDeclarationReturnCarrier(declarationNode, { sourceFile });
    const returnCarrier = probeCarrierFromResolution(returnCarrierResolution);
    const inferred = returnCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(returnCarrier);
    if (inferred === undefined) {
      const detail = missingCarrierDiagnosticDetail(returnCarrierResolution, "Signature return carrier fact is missing.");
      diagnostics.push(unsupportedNodeDiagnostic(
        declarationNode,
        returnCarrierResolution.kind === "missing"
          ? `C# ${context} emission requires a finalized signature return carrier: ${detail.reason}`
          : `C# ${context} emission requires a renderable signature return carrier fact; backend must not infer C# return types from raw TSTS semantic types.`,
        detail.evidence,
      ));
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

function getDeclarationReturnTargetType(
  typeNode: Node | undefined,
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  if (typeNode !== undefined) {
    return getTargetTypeRefForNode(input, typeNode, sourceFile);
  }
  return probeCarrierFromResolution(input.targetFacts.resolveDeclarationReturnCarrier(declarationNode, { sourceFile }));
}

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: TargetCompileInput): Node | undefined {
  const typeArguments = typeNode === undefined ? [] : input.ast.typeArguments(typeNode);
  return typeArguments[0];
}
