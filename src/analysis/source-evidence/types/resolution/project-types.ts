import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { SourceFileSemantics, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceTypeArgumentNodes } from "../../../../target-model/syntax/type-arguments.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { sourceInterfaceRepresentationBase } from "@tsonic/target-api/source";
import { bindCsharpSourceDeclarationArguments } from "./generic-arguments.js";
import { publishedCsharpCallableInterface } from "../published-callable-interface.js";
import { resolveCsharpSourceTypeDescriptor } from "./effective-types.js";

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
  selectedType: Type | undefined,
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
    selectedType,
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
  const callable = publishedCsharpCallableInterface(declaration, host);
  if (callable !== undefined) {
    const bound = bindCsharpSourceDeclarationArguments(scope, declaration, typeArguments, sourceArguments, state, queries);
    return bound === undefined ? undefined
      : resolveProjectCallableInterface(scope, declaration, callable, bound);
  }
  const base = sourceInterfaceRepresentationBase(declaration, host.ast, host.navigation, queries);
  if (base !== undefined && queries.types.isArrayLike(base.selectedType)) {
    const bound = bindCsharpSourceDeclarationArguments(scope, declaration, typeArguments, sourceArguments, state, queries);
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
  const parameters = [...definition.outerTypeParameters, ...ownParameters];
  const outcome = host.effectiveTypes.get(declaration);
  let descriptor: SourceTypeDescriptor | undefined = outcome?.kind === "resolved" || outcome?.kind === "default"
    ? outcome.type : undefined;
  while (descriptor?.kind === "optional") descriptor = descriptor.value;
  if ((descriptor?.kind === "callable" || descriptor?.kind === "shape") && descriptor.calls.length === 0 &&
    descriptor.constructs.length === 1) descriptor = descriptor.constructs[0]!.result;
  const reference = descriptor?.kind === "declared" && descriptor.declaration === declaration ? descriptor : undefined;
  const publication = reference !== undefined && reference.typeArguments.length === parameters.length ? {
      bindings: parameters.map((parameter, index) => ({ declaration: parameter, type: reference.typeArguments[index]! })),
      definitions: [reference],
    } : { bindings: [], definitions: [] };
  const projections = resolveCsharpProjectionArguments(scope, declaration, publication,
    [...outerArguments as readonly TargetTypeRef[], ...typeArguments], state,
    [...definition.outerTypeProjections, ...definition.typeProjections],
    parameters);
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
  callable: NonNullable<ReturnType<typeof publishedCsharpCallableInterface>>,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host } = scope;
  const { declarations } = callable;
  const inherited: TargetTypeRef[] = [];
  for (const candidate of declarations as readonly Node[]) {
    const heritage = host.navigation.declaredHeritage(candidate);
    if (heritage.kind !== "resolved") return undefined;
    for (const edge of heritage.edges) {
      if (edge.kind !== "extends") return undefined;
      const authoredArguments = host.ast.typeArguments(edge.heritage);
      if (edge.sourceDeclaration !== candidate || !host.ast.extendsHeritageElements(candidate).includes(edge.heritage) ||
        authoredArguments.length !== edge.typeArguments.length ||
        authoredArguments.some((argument, index) => argument !== edge.typeArguments[index]) ||
        edge.selectedTypeArguments === undefined ||
        edge.selectedTypeArguments.length !== host.ast.typeParameters(edge.target.declaration).length ||
        edge.typeArguments.length > edge.selectedTypeArguments.length) return undefined;
      const nativeArguments = edge.typeArguments.map(argument => scope.resolveNodeWithState(
        argument, host.semanticsFor(argument).sourceFile, nextState(state)));
      if (nativeArguments.some(argument => argument === undefined)) return undefined;
      const sourceArguments = edge.selectedTypeArguments.slice(0, edge.typeArguments.length);
      const base = projectSourceDeclarationTargetType(scope, edge.target.declaration,
        nativeArguments as readonly TargetTypeRef[], sourceArguments, nextState(state), edge.selectedType);
      if (base === undefined) return undefined;
      inherited.push(base);
    }
  }
  const ownSignature = declarations.some(candidate => host.ast.members(candidate).some(member =>
    member !== undefined && host.ast.is.IsCallSignatureDeclaration(member)));
  const selected = ownSignature || inherited.length === 0
    ? resolveCsharpSourceTypeDescriptor(scope, callable.type, nextState(state), declaration) : inherited[0];
  if (selected === undefined) return undefined;
  if (inherited.some(base => !targetTypeRefEquals(base, selected))) {
    state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: declaration,
      code: "CSHARP_CALLABLE_NATIVE_SIGNATURE_CONFLICT",
      reason: "A callable interface requires one exact native signature across every inherited call contract." }));
    return undefined;
  }
  return selected;
}
