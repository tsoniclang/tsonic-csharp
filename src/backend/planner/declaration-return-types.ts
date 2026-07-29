import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  sourceNodesEqual,
} from "@tsonic/target-api";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  getCsharpTaskResultTargetType,
} from "../../policy/types/index.js";

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnTargetType = getInferredDeclarationReturnTargetType(
      declarationNode,
      sourceFile,
      input,
    );
    const inferred = returnTargetType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(returnTargetType);
    if (inferred === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        declarationNode,
        `C# ${context} emission requires one exact checked source signature with a closed target return representation.`,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): { readonly type: ReturnType<typeof getCsharpTypeForNode>; readonly subject?: Node; readonly targetType: TargetTypeRef } | undefined {
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
  return { type, ...(subject === undefined ? {} : { subject }), targetType: resultTargetType };
}

function getDeclarationReturnTargetType(
  typeNode: Node | undefined,
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
) {
  if (typeNode !== undefined) {
    return input.types.resolveNode(typeNode, sourceFile);
  }
  return getInferredDeclarationReturnTargetType(
    declarationNode,
    sourceFile,
    input,
  );
}

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: CsharpTranslationContext): Node | undefined {
  const typeArguments = typeNode === undefined ? [] : input.ast.typeArguments(typeNode);
  return typeArguments[0];
}

function getInferredDeclarationReturnTargetType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): TargetTypeRef | undefined {
  const checker = input.queries(sourceFile).checker;
  const declarationType = checker.getTypeAtLocation(
    declarationNode,
  );
  const signatures = checker.getCallSignaturesOfType(
    declarationType,
  );
  const selected = signatures.filter((signature) => {
    const declaration = checker.getSignatureDeclaration(signature);
    return declaration !== undefined &&
      sourceNodesEqual(input.ast, declaration, declarationNode);
  });
  if (selected.length !== 1) {
    return undefined;
  }
  return input.types.resolveType(
    checker.getReturnTypeOfSignature(selected[0]!),
    sourceFile,
  );
}
