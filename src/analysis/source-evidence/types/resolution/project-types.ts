import type { Node, SourceFile, Symbol, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpSourceTypeArgumentNodes } from "../../../../target-model/syntax/type-arguments.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { sourceCallableInterface, sourceInterfaceRepresentationBase } from "@tsonic/target-api/source";
import { bindCsharpSourceDeclarationArguments } from "./generic-arguments.js";
import { formAuthoredAndSelectedSourceType, resolveFormedAuthoredAndSelectedSourceType,
  type CsharpAuthoredTypeSelectionEvidence } from "./selected-values.js";
import { formCsharpProjectDeclarationArgumentCapture, bindCsharpProjectDeclarationArguments,
  completeCsharpProjectDeclarationArguments, type CsharpProjectDeclarationArguments } from "./project-declaration-arguments.js";

export interface CsharpSelectedSymbolSource {
  readonly symbol: Symbol;
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly typeNodes: readonly Node[];
  readonly selections: readonly CsharpAuthoredTypeSelectionEvidence[];
}

export interface CsharpProjectSemanticSource {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly sourceArguments: readonly (Type | undefined)[] | undefined;
  readonly owners: readonly {
    readonly declarations: readonly Node[];
    readonly apparent: Type | undefined;
  }[];
}

export interface CsharpProjectReferenceSource {
  readonly node: Node;
  readonly sourceFile: SourceFile;
  readonly queries: SourceFileSemantics;
  readonly declaration: Node;
  readonly selectedType: Type | undefined;
  readonly state: CsharpTypeResolutionState;
  readonly arguments: readonly {
    readonly node: Node;
    readonly sourceFile: SourceFile;
    readonly state: CsharpTypeResolutionState;
  }[];
  readonly sourceArguments: readonly (Type | undefined)[];
}

export function resolveSelectedSymbolType(
  scope: CsharpTypeResolutionScope,
  symbol: Symbol,
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const source = formCsharpSelectedSymbolSource(scope, symbol, selectedType, queries, state);
  return source === undefined ? undefined : resolveFormedCsharpSelectedSymbolType(scope, source);
}

export function formCsharpSelectedSymbolSource(
  scope: Pick<CsharpTypeResolutionScope, "declarationResultTypeNode" | "host">,
  symbol: Symbol,
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSelectedSymbolSource | undefined {
  if (selectedType === undefined) return undefined;
  const roots = definedValues(queries.declarations.rootSymbols(symbol));
  const selectedSymbols = roots.length === 0 ? [symbol] : roots;
  const typeNodes = Object.freeze(definedValues(selectedSymbols.flatMap(selected =>
    definedValues(queries.declarations.symbolDeclarations(selected)).map(declaration =>
      scope.declarationResultTypeNode(declaration)))));
  if (typeNodes.length === 0) return undefined;
  const selections = Object.freeze(typeNodes.map(typeNode => formAuthoredAndSelectedSourceType(
    scope, typeNode, scope.host.ast.getSourceFile(typeNode) ?? queries.sourceFile,
    selectedType, queries.sourceFile, nextState(state))));
  return Object.freeze({ symbol, selectedType, queries, state, typeNodes, selections });
}

export function resolveFormedCsharpSelectedSymbolType(
  scope: CsharpTypeResolutionScope,
  source: CsharpSelectedSymbolSource,
): TargetTypeRef | undefined {
  const targets = source.selections.map(selection => resolveFormedAuthoredAndSelectedSourceType(scope, selection));
  if (targets.some(target => target === undefined)) return undefined;
  const first = targets[0]!;
  return targets.every(target => target !== undefined && targetTypeRefEquals(target, first)) ? first : undefined;
}

export function resolveProjectSourceSemanticType(
  scope: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  typeArguments: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpProjectSemanticType(scope,
    formCsharpProjectSemanticSource(scope, type, queries, state), typeArguments);
}

export function formCsharpProjectSemanticSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpProjectSemanticSource {
  const symbols = [queries.declarations.typeAliasSymbol(type), queries.declarations.typeSymbol(type)];
  const owners = symbols.flatMap(symbol => {
    if (symbol === undefined) return [];
    const declarations = definedValues(queries.declarations.symbolDeclarations(symbol));
    const apparent = !queries.types.isTypeReference(type) && declarations.some(declaration =>
      host.ast.is.IsClassDeclaration(declaration) || host.ast.is.IsClassExpression(declaration) ||
      host.ast.is.IsInterfaceDeclaration(declaration)) ? queries.types.apparentType(type) : undefined;
    return [Object.freeze({ declarations: Object.freeze(declarations),
      apparent: apparent !== undefined && apparent !== type &&
        queries.declarations.typeSymbol(apparent) === symbol ? apparent : undefined })];
  });
  const sourceArguments = queries.types.effectiveTypeArguments(type);
  return Object.freeze({ type, queries, state, owners: Object.freeze(owners),
    sourceArguments: sourceArguments === undefined ? undefined : Object.freeze([...sourceArguments]) });
}

export function resolveFormedCsharpProjectSemanticType(
  scope: CsharpTypeResolutionScope,
  source: CsharpProjectSemanticSource,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const { type, queries, state } = source;
  for (const owner of source.owners) {
    if (owner.apparent !== undefined) return scope.resolveTypeWithState(
      owner.apparent, queries.sourceFile, nextState(state));
    for (const declaration of owner.declarations) {
      const targetType = scope.projectSourceDeclarationTargetType(
        declaration, typeArguments, source.sourceArguments, state, type);
      if (targetType !== undefined) return targetType;
    }
  }
  return undefined;
}

export function resolveProjectSourceType(
  scope: CsharpTypeResolutionScope,
  node: Node,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  typeArguments?: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
): TargetTypeRef | undefined {
  const source = formCsharpProjectReferenceSource(scope, node, sourceFile, state);
  return source === undefined ? undefined : resolveFormedCsharpProjectReference(
    scope, source, typeArguments, sourceArguments);
}

export function formCsharpProjectReferenceSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): CsharpProjectReferenceSource | undefined {
  const reference = host.navigation.referenceFor(node);
  if (reference === undefined) return undefined;
  const arguments_ = csharpSourceTypeArgumentNodes(host.ast, node);
  const queries = host.semantics(sourceFile);
  const childState = Object.freeze(nextState(state));
  return Object.freeze({ node, sourceFile, queries, declaration: reference.declaration,
    selectedType: queries.types.authoredType(node), state,
    sourceArguments: Object.freeze(arguments_.map(argument => queries.types.authoredType(argument))),
    arguments: Object.freeze(arguments_.map(argument => Object.freeze({
      node: argument, sourceFile, state: childState,
    }))),
  });
}

export function resolveFormedCsharpProjectReference(
  scope: CsharpTypeResolutionScope,
  source: CsharpProjectReferenceSource,
  typeArguments?: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
): TargetTypeRef | undefined {
  const resolvedArguments = typeArguments ?? source.arguments.map(argument =>
    scope.resolveNodeWithState(argument.node, argument.sourceFile, argument.state));
  if (resolvedArguments.some(argument => argument === undefined)) return undefined;
  return scope.projectSourceDeclarationTargetType(source.declaration,
    resolvedArguments as readonly TargetTypeRef[], sourceArguments ?? source.sourceArguments,
    source.state, source.selectedType);
}

export function projectSourceDeclarationTargetType(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
  state: CsharpTypeResolutionState = { depth: 0 },
  selectedType?: Type,
): TargetTypeRef | undefined {
  const { host } = scope;
  if (!host.navigation.isProjectDeclaration(declaration)) return undefined;
  const queries = host.semanticsFor(declaration);
  const declaredType = host.ast.is.IsInterfaceDeclaration(declaration)
    ? queries.declarations.declaredType(declaration) : undefined;
  if (sourceCallableInterface(declaredType, queries, host.ast) !== undefined) {
    const bound = bindCsharpSourceDeclarationArguments(scope, declaration, typeArguments, sourceArguments, state);
    return bound === undefined || declaredType === undefined ? undefined
      : resolveProjectCallableInterface(scope, declaration, declaredType, bound);
  }
  const base = sourceInterfaceRepresentationBase(declaration, host.ast, host.navigation, queries);
  if (base !== undefined && queries.types.isArrayLike(base.selectedType)) {
    const bound = bindCsharpSourceDeclarationArguments(scope, declaration, typeArguments, sourceArguments, state);
    return bound === undefined ? undefined : scope.resolveTypeWithState(base.selectedType,
      host.semanticsFor(base.heritage).sourceFile, nextState(bound));
  }
  const declared = host.projectTypeCatalog.declarationForNode(declaration);
  if (declared === undefined) return undefined;
  const arguments_ = completeCsharpProjectDeclarationArguments(scope,
    bindCsharpProjectDeclarationArguments(formCsharpProjectDeclarationArgumentCapture(scope, declared,
      sourceArguments, selectedType), state), typeArguments);
  return arguments_ === undefined ? undefined : completeCsharpProjectDeclarationTarget(scope, arguments_);
}

export function completeCsharpProjectDeclarationTarget(
  scope: CsharpTypeResolutionScope,
  arguments_: CsharpProjectDeclarationArguments,
): TargetTypeRef | undefined {
  const { host } = scope;
  const { declaration: declared, state } = arguments_.source;
  const declaration = declared.declaration;
  const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
  if (definition?.declared !== declared) return failTargetAnalysisInvariant("tsonic-csharp",
    "Physical project arguments require the exact declared owner whose inputs were completed.", declaration);
  const { outerArguments } = arguments_;
  const ownParameters = declared.typeParameters;
  const projections = resolveCsharpProjectionArguments(scope, declaration,
    arguments_.sourceArguments,
    [...outerArguments, ...arguments_.arguments], state,
    [...definition.outerTypeProjections, ...definition.typeProjections],
    [...definition.outerTypeParameters, ...ownParameters]);
  if (projections === undefined) return undefined;
  const outerProjectionCount = definition.outerTypeProjections.length;
  return host.projectTypeCatalog.targetTypeForDeclaration(
    declaration,
    [...outerArguments, ...projections.slice(0, outerProjectionCount),
      ...arguments_.arguments, ...projections.slice(outerProjectionCount)],
  );
}

function resolveProjectCallableInterface(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  declaredType: Type,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host } = scope;
  const queries = host.semanticsFor(declaration);
  const symbol = queries.declarations.typeSymbol(declaredType);
  const declarations = symbol === undefined ? [declaration] : queries.declarations.symbolDeclarations(symbol);
  if (declarations.length === 0 || declarations.some(candidate =>
    candidate === undefined || !host.ast.is.IsInterfaceDeclaration(candidate))) return undefined;
  const inherited: TargetTypeRef[] = [];
  for (const candidate of declarations as readonly Node[]) {
    const heritage = host.navigation.declaredHeritage(candidate);
    if (heritage.kind !== "resolved") return undefined;
    for (const edge of heritage.edges) {
      if (edge.kind !== "extends") return undefined;
      const nativeArguments = edge.typeArguments.map(argument => scope.resolveNodeWithState(
        argument, host.semanticsFor(argument).sourceFile, nextState(state)));
      if (nativeArguments.some(argument => argument === undefined)) return undefined;
      const sourceArguments = edge.typeArguments.map(argument => host.semanticsFor(argument).types.authoredType(argument));
      const base = projectSourceDeclarationTargetType(scope, edge.target.declaration,
        nativeArguments as readonly TargetTypeRef[], sourceArguments, nextState(state), edge.selectedType);
      if (base === undefined) return undefined;
      inherited.push(base);
    }
  }
  const ownSignature = declarations.some(candidate => host.ast.members(candidate).some(member =>
    member !== undefined && host.ast.is.IsCallSignatureDeclaration(member)));
  const selected = ownSignature || inherited.length === 0
    ? scope.resolveCallableType(declaredType, queries, nextState(state)) : inherited[0];
  if (selected === undefined) return undefined;
  if (inherited.some(base => !targetTypeRefEquals(base, selected))) {
    state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: declaration,
      code: "CSHARP_CALLABLE_NATIVE_SIGNATURE_CONFLICT",
      reason: "A callable interface requires one exact native signature across every inherited call contract." }));
    return undefined;
  }
  return selected;
}
