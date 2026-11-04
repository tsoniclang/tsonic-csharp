import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceLiteralValue, SourceProgramNavigation } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";

export interface CsharpNodeBranchSource {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly nodeKind: string;
  readonly arrayLiteral: boolean;
  readonly identifier: boolean;
  readonly classOrInterface: boolean;
  readonly literal: SourceLiteralValue | undefined;
  readonly typeQuery: {
    readonly expression: Node | undefined;
    readonly reference: ReturnType<SourceProgramNavigation["referenceFor"]>;
    readonly declaration: Node | undefined;
  } | undefined;
}

export function formCsharpNodeBranchSource(
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "literalValues">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpNodeBranchSource {
  const query = host.ast.is.IsTypeQueryNode(node);
  const expression = query ? host.ast.as.AsTypeQueryNode(node)?.ExprName : undefined;
  const reference = query ? host.navigation.referenceFor(expression) : undefined;
  const typeQuery = query ? Object.freeze({ expression, reference, declaration: reference?.declaration }) : undefined;
  return Object.freeze({ node, queries, state, nodeKind: host.ast.kindName(node),
    arrayLiteral: host.ast.is.IsArrayLiteralExpression(node),
    identifier: host.ast.is.IsIdentifier(node),
    classOrInterface: host.ast.is.IsClassDeclaration(node) || host.ast.is.IsInterfaceDeclaration(node),
    literal: host.literalValues.literalValue.get(node), typeQuery,
  });
}

export function assertCsharpNodeBranchSource(source: CsharpNodeBranchSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      typeof source.nodeKind !== "string" || typeof source.arrayLiteral !== "boolean" || typeof source.identifier !== "boolean" ||
      typeof source.classOrInterface !== "boolean" ||
      !Object.prototype.hasOwnProperty.call(source, "literal") || !Object.prototype.hasOwnProperty.call(source, "typeQuery")) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A node branch requires its exact retained syntax and value Source.", source?.node);
  }
  const query = source.typeQuery;
  if (query !== undefined && (!Object.prototype.hasOwnProperty.call(query, "expression") ||
      !Object.prototype.hasOwnProperty.call(query, "reference") || !Object.prototype.hasOwnProperty.call(query, "declaration") ||
      query.declaration !== query.reference?.declaration)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A node branch requires its exact retained type-query declaration.", source.node);
  }
}
