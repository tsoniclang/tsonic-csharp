import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { sourceTypeIsAuthoredEmptyObject } from "@tsonic/target-api/source";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

interface SelectedObjectShapeSource {
  readonly type: Type | undefined;
  readonly contextualTarget?: TargetTypeRef;
}

export function selectedObjectShapeSource(
  node: Node,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
): SelectedObjectShapeSource {
  if (host.ast.is.IsClassDeclaration(node) || host.ast.is.IsClassExpression(node)) {
    return { type: queries.declarations.declaredType(node) };
  }
  const semanticType = queries.types.expressionType(node);
  if (!host.ast.is.IsObjectLiteralExpression(node)) {
    return { type: semanticType };
  }
  const contextual = queries.types.contextualValueSelection(node);
  if (contextual.kind !== "selected") {
    return { type: semanticType };
  }
  const contextualType = contextual.component.selectedType;
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
  const providerDeclaration = [
    ...queries.facts.typeSubjects(contextualType),
    ...(contextualSymbol === undefined
      ? []
      : [contextualSymbol, ...contextualDeclarations]),
  ].some((subject) =>
    subject !== undefined &&
    host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined
  );
  if (!projectDeclaration && !providerDeclaration) {
    return { type: semanticType };
  }
  const contextualTarget = host.typeResolver.resolveSelectedType(
    contextual.component.authoredTypeNode, contextualType,
    queries.sourceFile,
    nextState(state),
  );
  if (contextualTarget === undefined) {
    return { type: semanticType };
  }
  if (projectDeclaration && !isProjectSourceTargetType(contextualTarget)) {
    return { type: semanticType };
  }
  return { type: contextualType, contextualTarget };
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
  if (!queries.types.couldContainTypeVariables(type) ||
    sourceTypeIsAuthoredEmptyObject(type, host.ast, queries, host.navigation)) {
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
  host: CsharpObjectShapePolicyHost,
): boolean {
  const profile = classifyCsharpSourceProfileType(type, queries, host.ast);
  return queries.types.isAny(type) ||
    queries.types.isUnknown(type) ||
    queries.types.isNever(type) ||
    queries.types.isVoidLike(type) ||
    queries.types.isNullish(type) ||
    queries.types.isStringLike(type) ||
    queries.types.isNumberLike(type) ||
    queries.types.isBooleanLike(type) ||
    queries.types.isBigIntLike(type) ||
    (profile !== undefined && (profile.kind !== "record" || queries.types.indexInfos(type).length > 0)) ||
    queries.types.isUnion(type) ||
    queries.types.isTuple(type) ||
    queries.types.callSignatures(type).length > 0 ||
    queries.types.constructSignatures(type).length > 0;
}

export function isCsharpNativeSourceProfileMemberDeclaration(
  declaration: Node,
  ast: CsharpObjectShapePolicyHost["ast"],
): boolean {
  const parent = ast.parent(declaration);
  const owner = parent !== undefined && ast.is.IsTypeLiteralNode(parent) ? ast.parent(parent) : parent;
  return owner !== undefined && classifyCsharpSourceProfileDeclaration(owner, ast) !== undefined;
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
  const properties = queries.types.propertyInfos(type);
  const memberDeclarations = properties.map(property => [...new Set([
    ...queries.declarations.symbolDeclarations(property.symbol),
    ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
  ])]);
  const sourceProfileDataMember = (declaration: Node): boolean => {
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file) || host.ast.kindName(declaration) !== "KindPropertySignature") return false;
    const parent = host.ast.parent(declaration);
    if (parent === undefined) return false;
    const literal = host.ast.is.IsTypeLiteralNode(parent);
    const owner = literal ? host.ast.parent(parent) : parent;
    if (owner === undefined || (literal
      ? !host.ast.is.IsTypeAliasDeclaration(owner) || host.ast.as.AsTypeAliasDeclaration(owner)?.Type !== parent
      : !host.ast.is.IsInterfaceDeclaration(owner))) return false;
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.semantics(file), host.sourceFacts, owner);
    const members = host.ast.members(parent);
    return identity?.kind === "type" && identity.declaration === owner &&
      classifyCsharpSourceProfileDeclaration(owner, host.ast) === undefined && members.includes(declaration) &&
      members.every(member => member !== undefined && host.ast.kindName(member) === "KindPropertySignature") &&
      queries.types.callSignatures(type).length === 0 && queries.types.constructSignatures(type).length === 0 &&
      queries.types.indexInfos(type).length === 0;
  };
  if (!memberDeclarations.every(declarations => declarations.every(declaration => {
    if (declaration === undefined) return false;
    if (host.navigation.isProjectDeclaration(declaration)) return true;
    if (isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast)) return true;
    const identity = host.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
    if (identity === undefined) return sourceProfileDataMember(declaration);
    const selection = host.providers.resolveMember(identity);
    return selection.kind === "resolved" && selection.relations.length === 1 &&
      selection.relations[0]!.kind === "member";
  }))) {
    return false;
  }
  if (node !== undefined && host.navigation.isProjectDeclaration(node) &&
    queries.types.standardTransformation(node, type)?.kind === "structural") {
    return true;
  }
  if (node !== undefined &&
    (host.ast.is.IsObjectLiteralExpression(node) || host.ast.is.IsTypeLiteralNode(node)) &&
    host.navigation.isProjectDeclaration(node)) {
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
  return properties.length > 0 && memberDeclarations.every(declarations => declarations.length > 0);
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
    (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== undefined;
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
