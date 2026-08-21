import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpNeverTargetType,
} from "../../../target-model/types/index.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../target-model/syntax/type-arguments.js";

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnTargetType = getInferredDeclarationReturnTargetType(
      declarationNode,
      sourceFile,
      input,
    );
    const inferred = csharpDeclarationReturnType(returnTargetType);
    if (inferred === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        declarationNode,
        `C# ${context} emission requires one exact checked source signature with a closed target return representation.`,
      ));
      return invalidCsharpType(`${context} return type`);
    }
    return inferred;
  }
  const explicitTargetType = input.types.classifications.resolveNode(typeNode, sourceFile);
  if (isCsharpNeverTargetType(explicitTargetType)) {
    const neverReturnType = csharpDeclarationReturnType(explicitTargetType);
    if (neverReturnType !== undefined) {
      return neverReturnType;
    }
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

function csharpDeclarationReturnType(
  targetType: TargetTypeRef | undefined,
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  if (isCsharpNeverTargetType(targetType)) {
    return csharpTypeFromTargetTypeRef(csharpVoidTargetType());
  }
  return targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
}

export function getAsyncReturnExpressionExpectedType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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

export function getDeclarationReturnTargetType(
  typeNode: Node | undefined,
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
) {
  if (typeNode !== undefined) {
    return input.types.classifications.resolveNode(typeNode, sourceFile);
  }
  return getInferredDeclarationReturnTargetType(
    declarationNode,
    sourceFile,
    input,
  );
}

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: CsharpPlanningContext): Node | undefined {
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, typeNode);
  return typeArguments[0];
}

function getInferredDeclarationReturnTargetType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): TargetTypeRef | undefined {
  void sourceFile;
  const contract = input.program.declarations.returnContract(declarationNode);
  return contract?.kind === "resolved" ? contract.type : undefined;
}
