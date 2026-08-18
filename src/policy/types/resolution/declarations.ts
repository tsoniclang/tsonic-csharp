import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../model/definitions.js";
import { nextState } from "./state.js";
import { readCsharpSourceField } from "./source-markers.js";

export function resolveSelectedDeclarationResult(
  { declarationResultTypeNode, host, resolveAuthoredAndSelectedSourceType, resolveCallableType, resolveNodeWithState, resolveProjectEnumMemberTarget }: CsharpTypeResolutionScope,
  declaration: Node | undefined,
  semanticType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  receiverType?: TargetTypeRef,
): TargetTypeRef | undefined {
  const sourceField = readCsharpSourceField(host.sourceFacts, [declaration]);
  if (sourceField !== undefined) {
    const fieldSourceFile = host.ast.getSourceFile(sourceField.sourceType) ??
      queries.sourceFile;
    return resolveNodeWithState(
      sourceField.sourceType,
      fieldSourceFile,
      nextState(state),
    );
  }
  const enumMemberTarget = resolveProjectEnumMemberTarget(declaration);
  if (enumMemberTarget !== undefined) {
    return enumMemberTarget;
  }
  if (
    semanticType !== undefined &&
    queries.getCallSignatures(semanticType).length > 0
  ) {
    return resolveCallableType(
      semanticType,
      queries,
      nextState(state),
    );
  }
  const declarationType = declaration === undefined ||
      !host.navigation.isProjectDeclaration(declaration)
    ? undefined
    : declarationResultTypeNode(declaration);
  const declarationSourceFile = declarationType === undefined
    ? queries.sourceFile
    : host.ast.getSourceFile(declaration) ?? queries.sourceFile;
  const authored = declarationType === undefined
    ? undefined
    : resolveNodeWithState(
        declarationType,
        declarationSourceFile,
        nextState(state),
      );
  if (authored !== undefined) {
    const instantiated = host.projectTypes().instantiateMemberType(
      declaration,
      receiverType,
      authored,
    );
    if (instantiated.kind === "unresolved") {
      return undefined;
    }
    if (instantiated.kind === "resolved") {
      return instantiated.type;
    }
  }
  return resolveAuthoredAndSelectedSourceType(
    declarationType,
    declarationSourceFile,
    semanticType,
    queries.sourceFile,
    state,
  );
}


export function resolveProjectEnumMemberTarget(
  { host, projectSourceDeclarationTargetType }: CsharpTypeResolutionScope,
  declaration: Node | undefined,
): TargetTypeRef | undefined {
  if (declaration === undefined || !host.ast.is.IsEnumMember(declaration)) {
    return undefined;
  }
  const parent = host.ast.parent(declaration);
  return parent !== undefined && host.ast.is.IsEnumDeclaration(parent)
    ? projectSourceDeclarationTargetType(parent, [])
    : undefined;
}


export function declarationResultTypeNode(
  { host }: CsharpTypeResolutionScope,
  declaration: Node | undefined,
): Node | undefined {
  if (declaration === undefined) {
    return undefined;
  }
  if (host.ast.is.IsFunctionDeclaration(declaration)) {
    return host.ast.as.AsFunctionDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsMethodDeclaration(declaration)) {
    return host.ast.as.AsMethodDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsMethodSignatureDeclaration(declaration)) {
    return host.ast.as.AsMethodSignatureDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsCallSignatureDeclaration(declaration)) {
    return host.ast.as.AsCallSignatureDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsFunctionTypeNode(declaration)) {
    return host.ast.as.AsFunctionTypeNode(declaration)?.Type;
  }
  if (host.ast.is.IsArrowFunction(declaration)) {
    return host.ast.as.AsArrowFunction(declaration)?.Type;
  }
  if (host.ast.is.IsFunctionExpression(declaration)) {
    return host.ast.as.AsFunctionExpression(declaration)?.Type;
  }
  if (host.ast.is.IsGetAccessorDeclaration(declaration)) {
    return host.ast.as.AsGetAccessorDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsPropertyDeclaration(declaration)) {
    return host.ast.as.AsPropertyDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsPropertySignatureDeclaration(declaration)) {
    return host.ast.as.AsPropertySignatureDeclaration(declaration)?.Type;
  }
  if (host.ast.is.IsIndexSignatureDeclaration(declaration)) {
    return host.ast.as.AsIndexSignatureDeclaration(declaration)?.Type;
  }
  return undefined;
}
