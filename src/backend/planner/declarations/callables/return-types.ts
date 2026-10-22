import type { CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import {
  getCsharpTaskResultTargetType,
} from "../../../../target-model/types/index.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../../target-model/syntax/type-arguments.js";

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  void diagnostics;
  const carrier = getDeclarationReturnTargetType(typeNode, declarationNode, sourceFile, input);
  const type = csharpDeclarationReturnType(input.scope.typeParameterNames, carrier);
  return type ?? failCsharpPlannerInvariant(`An admitted C# ${context} requires its exact renderable return carrier.`, declarationNode);
}

function csharpDeclarationReturnType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  targetType: TargetTypeRef | undefined,
): CsharpTypeNode | undefined {
  return targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType, typeParameterNames);
}

export function getAsyncReturnExpressionExpectedType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): { readonly type: CsharpTypeNode; readonly subject?: Node; readonly targetType: TargetTypeRef } {
  void diagnostics;
  const returnTargetType = getDeclarationReturnTargetType(typeNode, declarationNode, sourceFile, input);
  const resultTargetType = getCsharpTaskResultTargetType(returnTargetType);
  if (resultTargetType === undefined) {
    failCsharpPlannerInvariant(`An admitted async C# ${context} requires its finalized result carrier.`, typeNode ?? declarationNode);
  }
  const type = csharpTypeFromTargetTypeRef(resultTargetType, input.scope.typeParameterNames);
  if (type === undefined) {
    failCsharpPlannerInvariant(`An admitted async C# ${context} requires its renderable result carrier.`, typeNode ?? declarationNode);
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
  void typeNode;
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
  const contract = input.program.records.returnContract.get(declarationNode);
  return contract?.kind === "resolved" ? contract.type : undefined;
}
