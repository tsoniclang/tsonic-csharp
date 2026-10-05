import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import { sourcePresentCallableType, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { nextState } from "./state.js";
import { readCsharpSourceField } from "./source-markers.js";
import { sourceRefinementOnlyRemovesNullish } from "./source-union-refinement.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/runtime-carriers.js";

export function resolveSelectedDeclarationResult(
  { declarationResultTypeNode, host, resolveAuthoredAndSelectedSourceType, resolveCallableType, resolveNodeWithState, resolveProjectEnumMemberTarget }: CsharpTypeResolutionScope,
  declaration: Node | undefined,
  semanticType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  receiverType?: TargetTypeRef,
  declaredMemberType?: Type,
): TargetTypeRef | undefined {
  const instantiate = (type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    if (type === undefined) return undefined;
    const selected = host.projectTypes().instantiateMemberType(declaration, receiverType, type);
    return selected.kind === "unresolved" ? undefined : selected.kind === "resolved" ? selected.type : type;
  };
  const sourceField = readCsharpSourceField(host.sourceFacts, [declaration]);
  if (sourceField !== undefined) {
    const fieldSourceFile = host.ast.getSourceFile(sourceField.sourceType) ??
      queries.sourceFile;
    return instantiate(resolveNodeWithState(
      sourceField.sourceType,
      fieldSourceFile,
      nextState(state),
    ));
  }
  const enumMemberTarget = resolveProjectEnumMemberTarget(declaration);
  if (enumMemberTarget !== undefined) {
    return enumMemberTarget;
  }
  const callableType = sourcePresentCallableType(semanticType, queries);
  if (callableType !== undefined) {
    const resolved = instantiate(resolveCallableType(
      callableType,
      queries,
      nextState(state),
    ));
    return resolved !== undefined && semanticType !== undefined &&
        sourceRefinementOnlyRemovesNullish(semanticType, callableType, queries)
      ? csharpNullableTargetType(resolved) : resolved;
  }
  const declarationType = declaration === undefined ||
      !host.navigation.isProjectDeclaration(declaration)
    ? undefined
    : declarationResultTypeNode(declaration);
  const declarationSourceFile = declarationType === undefined
    ? queries.sourceFile
    : host.ast.getSourceFile(declaration) ?? queries.sourceFile;
  const unchanged = declaredMemberType !== undefined && semanticType !== undefined &&
    queries.types.relationship(declaredMemberType, semanticType) === "identical";
  const removesNullish = !unchanged && declaredMemberType !== undefined && semanticType !== undefined &&
    sourceRefinementOnlyRemovesNullish(declaredMemberType, semanticType, queries);
  const refinement = !unchanged && declaredMemberType !== undefined && semanticType !== undefined
    ? queries.types.refinement(declaredMemberType, semanticType) : undefined;
  const excludesNullish = refinement?.kind === "members" && refinement.types.length > 0 &&
    refinement.types.every(type => !queries.types.isNullish(type));
  const authored = resolveAuthoredAndSelectedSourceType(
    declarationType,
    declarationSourceFile,
    declarationType !== undefined && (unchanged || removesNullish) ? undefined : semanticType,
    queries.sourceFile,
    state,
  );
  const selected = authored !== undefined && declaration !== undefined && host.ast.questionToken(declaration) !== undefined
    ? csharpNullableTargetType(authored) : authored;
  const result = instantiate(selected);
  return declarationType !== undefined && (removesNullish || excludesNullish) && result !== undefined
    ? getCsharpNullableElementTargetType(result) ?? getCsharpGenericOptionalParts(result)?.element ?? result
    : result;
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
