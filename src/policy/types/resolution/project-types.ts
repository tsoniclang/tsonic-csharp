import type {
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../model/definitions.js";
import { csharpSourceTypeArgumentNodes } from "./source-syntax.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { targetTypeRefEquals } from "../model/equality.js";

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
  const roots = definedValues(queries.getRootSymbols(symbol));
  const selectedSymbols = roots.length === 0 ? [symbol] : roots;
  const typeNodes = definedValues(selectedSymbols.flatMap((selected) =>
    definedValues(queries.getSymbolDeclarations(selected)).map((declaration) =>
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
): TargetTypeRef | undefined {
  const symbols = [
    queries.getTypeAliasSymbol(type),
    queries.getTypeSymbol(type),
  ];
  for (const symbol of symbols) {
    if (symbol === undefined) {
      continue;
    }
    for (const declaration of definedValues(
      queries.getSymbolDeclarations(symbol),
    )) {
      const targetType = projectSourceDeclarationTargetType(
        declaration,
        typeArguments,
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
  );
}


export function projectSourceDeclarationTargetType(
  { host }: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  return host.projectTypeCatalog.targetTypeForDeclaration(
    declaration,
    typeArguments,
  );
}
