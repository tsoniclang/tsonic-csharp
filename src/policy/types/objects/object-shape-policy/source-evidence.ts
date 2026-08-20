import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { CsharpObjectShapePolicyHost } from "./api.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../model/definitions.js";
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
  const semanticType = queries.getTypeAtLocation(node);
  if (!host.ast.is.IsObjectLiteralExpression(node)) {
    return { type: semanticType };
  }
  const contextual = queries.selectContextualValueType(node);
  if (contextual.kind !== "selected") {
    return { type: semanticType };
  }
  const contextualType = contextual.type;
  const contextualSymbol = queries.getTypeAliasSymbol(contextualType) ??
    queries.getTypeSymbol(contextualType);
  const contextualDeclarations = queries.getSymbolDeclarations(
    contextualSymbol,
  );
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
  const subjects: ExtensionFactSubject[] = [node];
  const referenceSymbol = queries.getResolvedSymbolOrNil(node);
  const locationSymbol = queries.getSymbolAtLocation(node);
  for (const symbol of [referenceSymbol, locationSymbol]) {
    if (symbol === undefined || subjects.includes(symbol)) {
      continue;
    }
    subjects.push(symbol);
    for (const declaration of queries.getSymbolDeclarations(symbol)) {
      if (declaration !== undefined && !subjects.includes(declaration)) {
        subjects.push(declaration);
      }
    }
  }
  return subjects;
}

export function requiresUnresolvedStructuralProjection(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  if (!queries.couldContainTypeVariables(type)) {
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
  return queries.getPropertyInfos(type).length === 0;
}

export function typeIsExcludedFromObjectShape(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.isAny(type) ||
    queries.isUnknown(type) ||
    queries.isNever(type) ||
    queries.isVoidLike(type) ||
    queries.isNullish(type) ||
    queries.isStringLike(type) ||
    queries.isNumberLike(type) ||
    queries.isBooleanLike(type) ||
    queries.isBigIntLike(type) ||
    queries.isUnion(type) ||
    queries.isTuple(type) ||
    queries.getCallSignatures(type).length > 0;
}

export function typeHasProjectOwnedShapeDeclaration(
  type: Type,
  node: Node | undefined,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const typeSymbols = [
    queries.getTypeAliasSymbol(type),
    queries.getTypeSymbol(type),
  ];
  const typeSubjects: ExtensionFactSubject[] = [type];
  for (const symbol of typeSymbols) {
    if (symbol === undefined) {
      continue;
    }
    typeSubjects.push(symbol);
    for (const declaration of queries.getSymbolDeclarations(symbol)) {
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
    queries.getSymbolDeclarations(symbol).some((declaration) =>
      host.navigation.isProjectDeclaration(declaration)
    )
  )) {
    return true;
  }
  const properties = queries.getPropertyInfos(type);
  return properties.length > 0 && properties.every((property) => {
    const declarations = queries.getSymbolDeclarations(property.symbol);
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
  return queries.isNullish(type) ||
    (
      queries.isUnion(type) &&
      queries.getUnionOrIntersectionTypes(type).some((member) =>
        member !== undefined && queries.isNullish(member)
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
  const symbol = queries.getTypeSymbol(type);
  if (symbol === undefined) {
    return false;
  }
  const declarations = queries.getSymbolDeclarations(symbol)
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
