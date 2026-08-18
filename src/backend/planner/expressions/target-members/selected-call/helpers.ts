import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { getCsharpDelegateSignature } from "../../../../../policy/types/index.js";
import { sourceFileIdentity } from "@tsonic/target-api/source";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../../../../roslyn/syntax.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetMember, CsharpTargetParameter, TargetTypeRef } from "../../../../../policy/types/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../../../../policy/members/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function targetDelegatePreservesOmission(
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  const targetCalleeType = input.types.resolveNode(
    source.sourceCallee.expression,
    sourceFile,
  );
  const signature = getCsharpDelegateSignature(targetCalleeType);
  return signature?.parameters.length ===
      source.sourceSelectedSignatureParameters.length &&
    signature.optionalParameterIndexes?.includes(parameterIndex) === true;
}

export function sourceCalleeRequiresExactTargetArity(
  source: ResolvedSourceCallInfo,
  input: CsharpPlanningContext,
): boolean {
  const declaration = source.sourceCallee.selectedDeclaration;
  return declaration !== undefined &&
    (
      input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.is.IsParameterDeclaration(declaration) ||
      input.ast.is.IsPropertyDeclaration(declaration) ||
      input.ast.is.IsPropertySignatureDeclaration(declaration) ||
      input.ast.is.IsBindingElement(declaration) ||
      input.ast.is.IsArrowFunction(declaration) ||
      input.ast.is.IsFunctionExpression(declaration)
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
  if (access === undefined || !input.ast.is.IsPropertyAccessExpression(access)) {
    return false;
  }
  return input.ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !==
    undefined;
}

export function isProjectSourceDeclaration(
  input: CsharpPlanningContext,
  declaration: Node | undefined,
): boolean {
  const sourceFile = input.ast.getSourceFile(declaration);
  return sourceFile !== undefined &&
    !sourceFile.IsDeclarationFile &&
    input.sourceFiles.some((candidate) =>
      sourceFileIdentity(input.ast, candidate) ===
        sourceFileIdentity(input.ast, sourceFile));
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
