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
  { projectSourceDeclarationTargetType }: CsharpTypeResolutionScope,
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
  const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
  if (definition === undefined) return undefined;
  const outerCount = definition.outerTypeParameters.length;
  if (typeArguments.length !== definition.typeParameterNames.length - outerCount) {
    if (typeArguments.length !== definition.sourceTypeParameterCount) return undefined;
    const sources = sourceArguments ?? host.ast.typeParameters(declaration).map(parameter =>
      parameter === undefined ? undefined : host.semanticsFor(declaration).types.authoredType(parameter));
    if (sources.some(source => source === undefined)) return undefined;
    const projections = resolveCsharpProjectionArguments(scope, declaration, sources as readonly Type[], typeArguments, state);
    if (projections === undefined) return undefined;
    typeArguments = [...typeArguments, ...projections];
  }
  const queries = host.semanticsFor(declaration);
  const bindings = selectedType === undefined ? undefined : queries.types.typeArgumentBindings(selectedType);
  const outerArguments = definition.outerTypeParameters.map((parameter, index): TargetTypeRef | undefined => {
    if (selectedType === undefined) return { kind: "type-parameter", name: definition.typeParameterNames[index]! };
    const binding = bindings?.find(candidate => candidate.declaration === parameter && candidate.scope === "outer");
    return binding === undefined ? undefined : scope.resolveTypeWithState(binding.argumentType, queries.sourceFile, nextState(state));
  });
  if (outerArguments.some(argument => argument === undefined)) return undefined;
  return host.projectTypeCatalog.targetTypeForDeclaration(
    declaration,
    [...outerArguments as readonly TargetTypeRef[], ...typeArguments],
  );
}
