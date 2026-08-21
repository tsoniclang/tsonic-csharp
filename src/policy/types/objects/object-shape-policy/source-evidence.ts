import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { CsharpObjectShapePolicyHost } from "./api.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { nextState } from "../../resolution/state.js";

interface SelectedObjectShapeSource {
  readonly type: Type | undefined;
  readonly contextualProjectTarget?: TargetTypeRef;
}

export function selectedObjectShapeSource(
  node: Node,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
): SelectedObjectShapeSource {
  const semanticType = queries.types.expressionType(node);
  if (!host.ast.is.IsObjectLiteralExpression(node)) {
    return { type: semanticType };
  }
  const contextual = queries.types.contextualValueSelection(node);
  if (contextual.kind !== "selected") {
    return { type: semanticType };
  }
  const contextualType = contextual.type;
  const contextualSymbol = queries.declarations.typeAliasSymbol(contextualType) ??
    queries.declarations.typeSymbol(contextualType);
  const contextualDeclarations = contextualSymbol === undefined
    ? []
    : queries.declarations.symbolDeclarations(contextualSymbol);
  const projectDeclaration = contextualDeclarations.some((declaration) =>
      declaration !== undefined &&
      host.navigation.isProjectDeclaration(declaration) &&
      (
        host.ast.is.IsClassDeclaration(declaration) ||
        host.ast.is.IsInterfaceDeclaration(declaration)
      )
    );
  if (!projectDeclaration) {
    return { type: semanticType };
  }
  const contextualProjectTarget = host.typeResolver.resolveType(
    contextualType,
    queries.sourceFile,
    nextState(state),
  );
  return contextualProjectTarget !== undefined &&
      isProjectSourceTargetType(contextualProjectTarget)
    ? { type: contextualType, contextualProjectTarget }
    : { type: semanticType };
}

export function sourceSubjects(
  node: Node,
  queries: SourceFileSemantics,
): readonly ExtensionFactSubject[] {
  return Object.freeze([
    ...new Set<ExtensionFactSubject>([
      node,
      ...queries.facts.authoredTypeSubjects(node),
    ]),
  ]);
}

export function requiresUnresolvedStructuralProjection(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  if (!queries.types.couldContainTypeVariables(type)) {
    return false;
  }
  if (
    node !== undefined &&
    (
      host.ast.is.IsTypeLiteralNode(node) ||
      host.ast.is.IsObjectLiteralExpression(node)
    )
  ) {
    return false;
  }
  return queries.types.propertyInfos(type).length === 0;
}

export function typeIsExcludedFromObjectShape(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.types.isAny(type) ||
    queries.types.isUnknown(type) ||
    queries.types.isNever(type) ||
    queries.types.isVoidLike(type) ||
    queries.types.isNullish(type) ||
    queries.types.isStringLike(type) ||
    queries.types.isNumberLike(type) ||
    queries.types.isBooleanLike(type) ||
    queries.types.isBigIntLike(type) ||
    queries.types.isUnion(type) ||
    queries.types.isTuple(type) ||
    queries.types.callSignatures(type).length > 0;
}

export function typeHasProjectOwnedShapeDeclaration(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const typeSymbols = [
    queries.declarations.typeAliasSymbol(type),
    queries.declarations.typeSymbol(type),
  ];
  const typeSubjects: ExtensionFactSubject[] = [type];
  for (const symbol of typeSymbols) {
    if (symbol === undefined) {
      continue;
    }
    typeSubjects.push(symbol);
    for (const declaration of queries.declarations.symbolDeclarations(symbol)) {
      if (declaration !== undefined) {
        typeSubjects.push(declaration);
      }
    }
  }
  if (typeSubjects.some((subject) =>
    host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined
  )) {
    return false;
  }
  if (node !== undefined && host.ast.is.IsObjectLiteralExpression(node)) {
    return true;
  }
  if (
    node !== undefined &&
    host.navigation.isProjectDeclaration(
      host.navigation.declarationFor(node),
    )
  ) {
    return true;
  }
  if (typeSymbols.some((symbol) =>
    symbol !== undefined && queries.declarations.symbolDeclarations(symbol).some((declaration) =>
      host.navigation.isProjectDeclaration(declaration)
    )
  )) {
    return true;
  }
  const properties = queries.types.propertyInfos(type);
  return properties.length > 0 && properties.every((property) => {
    const declarations = queries.declarations.symbolDeclarations(property.symbol);
    return declarations.length > 0 && declarations.every((declaration) =>
      declaration !== undefined &&
      host.navigation.isProjectDeclaration(declaration)
    );
  });
}

export function typeIncludesNullish(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.types.isNullish(type) ||
    (
      queries.types.isUnion(type) &&
      queries.types.unionOrIntersectionTypes(type).some((member) =>
        member !== undefined && queries.types.isNullish(member)
      )
    );
}
export function isProjectSourceTargetType(
  type: TargetTypeRef,
): type is CsharpTargetNamedTypeRef {
  return type.kind === "target-named" &&
    type.id.startsWith("tsonic.source:");
}

export function projectClassIsObjectInitializable(
  type: Type,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) {
    return false;
  }
  const declarations = queries.declarations.symbolDeclarations(symbol)
    .filter((declaration): declaration is Node =>
      declaration !== undefined &&
      host.ast.is.IsClassDeclaration(declaration) &&
      host.navigation.isProjectDeclaration(declaration)
    );
  if (declarations.length !== 1) {
    return false;
  }
  const constructors = host.navigation.classConstructors(declarations[0]!);
  return constructors.kind === "resolved" &&
    constructors.signatures.some((signature) =>
      signature.parameters.every((parameter) => parameter.acceptsOmission)
    );
}
