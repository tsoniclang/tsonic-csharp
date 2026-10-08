import type {
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourceTypeArgumentNodes } from "../../../target-model/syntax/type-arguments.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { sourceCallableInterface, sourceInterfaceRepresentationBase } from "@tsonic/target-api/source";
import { bindCsharpSourceDeclarationArguments } from "./generic-arguments.js";

export function resolveSelectedSymbolType(
  { declarationResultTypeNode, host, resolveAuthoredAndSelectedSourceType }: CsharpTypeResolutionScope,
  symbol: Symbol,
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (selectedType === undefined) {
    return undefined;
  }
  const roots = definedValues(queries.declarations.rootSymbols(symbol));
  const selectedSymbols = roots.length === 0 ? [symbol] : roots;
  const typeNodes = definedValues(selectedSymbols.flatMap((selected) =>
    definedValues(queries.declarations.symbolDeclarations(selected)).map((declaration) =>
      declarationResultTypeNode(declaration)
    )
  ));
  if (typeNodes.length === 0) {
    return undefined;
  }
  const targets = typeNodes.map((typeNode) =>
    resolveAuthoredAndSelectedSourceType(
      typeNode,
      host.ast.getSourceFile(typeNode) ?? queries.sourceFile,
      selectedType,
      queries.sourceFile,
      nextState(state),
    )
  );
  if (targets.some((target) => target === undefined)) {
    return undefined;
  }
  const first = targets[0]!;
  return targets.every((target) =>
      target !== undefined && targetTypeRefEquals(target, first)
    )
    ? first
    : undefined;
}


export function resolveProjectSourceSemanticType(
  { host, projectSourceDeclarationTargetType, resolveTypeWithState }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  typeArguments: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const symbols = [
    queries.declarations.typeAliasSymbol(type),
    queries.declarations.typeSymbol(type),
  ];
  for (const symbol of symbols) {
    if (symbol === undefined) {
      continue;
    }
    if (!queries.types.isTypeReference(type) && queries.declarations.symbolDeclarations(symbol).some(declaration =>
      host.ast.is.IsClassDeclaration(declaration) || host.ast.is.IsClassExpression(declaration) || host.ast.is.IsInterfaceDeclaration(declaration))) {
      const apparent = queries.types.apparentType(type);
      if (apparent !== undefined && apparent !== type && queries.declarations.typeSymbol(apparent) === symbol) {
        return resolveTypeWithState(apparent, queries.sourceFile, nextState(state));
      }
    }
    for (const declaration of definedValues(
      queries.declarations.symbolDeclarations(symbol),
    )) {
      const targetType = projectSourceDeclarationTargetType(
        declaration,
        typeArguments,
        queries.types.effectiveTypeArguments(type),
        state,
        type,
      );
      if (targetType !== undefined) {
        return targetType;
      }
    }
  }
  return undefined;
}


export function resolveProjectSourceType(
  { host, projectSourceDeclarationTargetType, resolveNodeWithState }: CsharpTypeResolutionScope,
  node: Node,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  typeArguments?: readonly TargetTypeRef[],
  sourceArguments?: readonly (Type | undefined)[],
): TargetTypeRef | undefined {
  const reference = host.navigation.referenceFor(node);
  if (reference === undefined) {
    return undefined;
  }
  const resolvedArguments = typeArguments ??
    csharpSourceTypeArgumentNodes(host.ast, node).map((argument) =>
      resolveNodeWithState(argument, sourceFile, nextState(state))
    );
  if (resolvedArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return projectSourceDeclarationTargetType(
    reference.declaration,
    resolvedArguments as readonly TargetTypeRef[],
    sourceArguments ?? csharpSourceTypeArgumentNodes(host.ast, node).map(argument => host.semantics(sourceFile).types.authoredType(argument)),
    state,
    host.semantics(sourceFile).types.authoredType(node),
  );
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
  const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
  if (definition === undefined) return undefined;
  const bindings = selectedType === undefined ? undefined : queries.types.typeArgumentBindings(selectedType);
  const outerSources = definition.outerTypeParameters.map(parameter => selectedType === undefined
    ? queries.types.authoredType(parameter)
    : bindings?.find(candidate => candidate.declaration === parameter && candidate.scope === "outer")?.argumentType);
  const outerArguments = outerSources.map((source, index): TargetTypeRef | undefined => {
    if (selectedType === undefined) return definition.typeParameterBindings[index]!;
    return source === undefined ? undefined : scope.resolveTypeWithState(source, queries.sourceFile, nextState(state));
  });
  if (outerArguments.some(argument => argument === undefined) || outerSources.some(source => source === undefined)) return undefined;
  const ownParameters = definition.typeParameters;
  const sources = sourceArguments ?? ownParameters.map(parameter =>
    parameter === undefined ? undefined : queries.types.authoredType(parameter));
  if (sources.some(source => source === undefined) || typeArguments.length !== definition.sourceTypeParameterCount) return undefined;
  const projections = resolveCsharpProjectionArguments(scope, declaration,
    [...outerSources, ...sources] as readonly Type[],
    [...outerArguments as readonly TargetTypeRef[], ...typeArguments], state,
    [...definition.outerTypeProjections, ...definition.typeProjections],
    [...definition.outerTypeParameters, ...ownParameters]);
  if (projections === undefined) return undefined;
  const outerProjectionCount = definition.outerTypeProjections.length;
  return host.projectTypeCatalog.targetTypeForDeclaration(
    declaration,
    [...outerArguments as readonly TargetTypeRef[], ...projections.slice(0, outerProjectionCount),
      ...typeArguments, ...projections.slice(outerProjectionCount)],
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
  return selected === undefined || inherited.some(base => !targetTypeRefEquals(base, selected)) ? undefined : selected;
}
