import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { sourceFileIdentity } from "@tsonic/target-api/source";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetMember, CsharpTargetParameter, TargetTypeRef } from "../../../../../target-model/types/index.js";
import type { Node } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function sourceCalleeRequiresExactTargetArity(
  source: ResolvedSourceCallInfo,
  input: CsharpPlanningContext,
): boolean {
  const declaration = source.sourceCallee.selectedDeclaration;
  return declaration !== undefined &&
    (
      input.program.source.ast.is.IsVariableDeclaration(declaration) ||
      input.program.source.ast.is.IsParameterDeclaration(declaration) ||
      input.program.source.ast.is.IsPropertyDeclaration(declaration) ||
      input.program.source.ast.is.IsPropertySignatureDeclaration(declaration) ||
      input.program.source.ast.is.IsBindingElement(declaration) ||
      input.program.source.ast.is.IsArrowFunction(declaration) ||
      input.program.source.ast.is.IsFunctionExpression(declaration)
    );
}

export function applyCalleeTypeArguments(
  callee: CsharpExpression,
  typeArguments: readonly TargetTypeRef[],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const rendered = renderCsharpTargetTypeArguments(
    typeArguments,
    node,
    diagnostics,
  );
  if (rendered === undefined || rendered.length === 0) {
    return rendered === undefined ? undefined : callee;
  }
  switch (callee.kind) {
    case "IdentifierName":
    case "QualifiedName":
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...rendered],
      };
    default:
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected generic source call requires a C# callee shape that can carry type arguments.",
      ));
      return undefined;
  }
}

export function renderCsharpTargetTypeArguments(
  typeArguments: readonly TargetTypeRef[],
  node: Node,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] | undefined {
  const rendered = typeArguments.map(csharpTypeFromTargetTypeRef);
  if (rendered.some((argument) => argument === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected call contains a target type argument that cannot be rendered in C#.",
    ));
    return undefined;
  }
  return rendered as readonly CsharpTypeNode[];
}

export function sourceCallIsOptional(
  input: CsharpPlanningContext,
  source: ResolvedSourceCallInfo,
): boolean {
  const access = source.sourceCalleeAccess?.expression;
  if (access === undefined || !input.program.source.ast.is.IsPropertyAccessExpression(access)) {
    return false;
  }
  return input.program.source.ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !==
    undefined;
}

export function isProjectSourceDeclaration(
  input: CsharpPlanningContext,
  declaration: Node | undefined,
): boolean {
  const sourceFile = input.program.source.ast.getSourceFile(declaration);
  return sourceFile !== undefined &&
    !sourceFile.IsDeclarationFile &&
    input.program.sourceFiles.some((candidate) =>
      sourceFileIdentity(input.program.source.ast, candidate) ===
        sourceFileIdentity(input.program.source.ast, sourceFile));
}

export function targetArgumentOrderIsRepresentable(
  indexes: readonly number[],
  parameters: readonly CsharpTargetParameter[],
): boolean {
  let previous = -1;
  for (const index of indexes) {
    if (index < previous || index > previous + 1) {
      return false;
    }
    if (
      index === previous &&
      parameters[index]?.paramsArray !== true
    ) {
      return false;
    }
    previous = index;
  }
  return true;
}

export function translateArrayCreationCall(
  node: Node,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  const resultType = member.returnType;
  if (
    invocation?.kind !== "array-creation" ||
    resultType?.kind !== "array" ||
    arguments_.length !== 1 ||
    invocation.lengthParameterIndex !== 0
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected array-creation relation does not contain one closed element type and one length argument.",
    ));
    return undefined;
  }
  const elementType = csharpTypeFromTargetTypeRef(resultType.element);
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected array-creation element type cannot be rendered in C#.",
    ));
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    size: arguments_[0]!.expression,
    elements: [],
  };
}
