import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export type CsharpNodeSyntaxChildSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly typeNode: Node | undefined;
  readonly child: {
    readonly node: Node | undefined;
    readonly sourceFile: SourceFile;
    readonly state: CsharpTypeResolutionState;
  };
} & (
  | { readonly kind: "annotation"; readonly nullable: boolean }
  | { readonly kind: "named-tuple" | "parenthesized" | "optional" | "rest" | "readonly" }
);

export interface CsharpNodeTypeSyntaxSource {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly annotation: CsharpNodeSyntaxChildSource | undefined;
  readonly nested: CsharpNodeSyntaxChildSource | undefined;
}

export function formCsharpNodeTypeSyntaxSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpNodeTypeSyntaxSource {
  const { ast } = host;
  const request = (child: Node | undefined) => Object.freeze({ node: child, sourceFile: queries.sourceFile,
    state: Object.freeze(nextState(state)) });
  const nestedSource = (kind: Exclude<CsharpNodeSyntaxChildSource["kind"], "annotation">,
    typeNode: Node | undefined): CsharpNodeSyntaxChildSource => Object.freeze({ kind, node, queries, state,
      typeNode, child: request(typeNode) });
  const typeNode = ast.is.IsPropertyDeclaration(node) || ast.is.IsPropertySignatureDeclaration(node) || ast.is.IsParameterDeclaration(node)
    ? ast.typeNode(node) : undefined;
  const annotation = typeNode === undefined ? undefined : Object.freeze({ kind: "annotation" as const,
    node, queries, state, typeNode, nullable: ast.questionToken(node) !== undefined, child: request(typeNode) });
  let nested: CsharpNodeSyntaxChildSource | undefined;
  if (ast.is.IsNamedTupleMember(node)) nested = nestedSource("named-tuple", ast.as.AsNamedTupleMember(node)!.Type);
  else if (ast.is.IsParenthesizedTypeNode(node)) nested = nestedSource("parenthesized", ast.as.AsParenthesizedTypeNode(node)!.Type);
  else if (ast.is.IsOptionalTypeNode(node)) nested = nestedSource("optional", ast.as.AsOptionalTypeNode(node)!.Type);
  else if (ast.is.IsRestTypeNode(node)) nested = nestedSource("rest", ast.as.AsRestTypeNode(node)!.Type);
  else if (ast.is.IsTypeOperatorNode(node) && ast.operatorKindName(node) === "KindReadonlyKeyword") {
    nested = nestedSource("readonly", ast.as.AsTypeOperatorNode(node)!.Type);
  }
  return Object.freeze({ node, queries, state, annotation, nested });
}

export function assertCsharpNodeSyntaxChildSource(source: CsharpNodeSyntaxChildSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      !Object.prototype.hasOwnProperty.call(source, "typeNode") || source.child === undefined || source.child.state === undefined ||
      source.child.node !== source.typeNode || source.child.sourceFile !== source.queries.sourceFile ||
      !["annotation", "named-tuple", "parenthesized", "optional", "rest", "readonly"].includes(source.kind) ||
      source.kind === "annotation" && (source.child.node === undefined || typeof source.nullable !== "boolean") ||
      source.child.state.depth !== source.state.depth + 1 ||
      source.child.state.sourceStorageSubject !== source.state.sourceStorageSubject ||
      source.child.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
      source.child.state.sourceBindings !== source.state.sourceBindings ||
      source.child.state.rejectNativeResolution !== source.state.rejectNativeResolution) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A syntax child requires its exact retained Source occurrence and original child state.", source?.node);
  }
}

export function assertCsharpNodeTypeSyntaxSource(source: CsharpNodeTypeSyntaxSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      !Object.prototype.hasOwnProperty.call(source, "annotation") || !Object.prototype.hasOwnProperty.call(source, "nested") ||
      source.annotation !== undefined && source.annotation.kind !== "annotation" || source.nested?.kind === "annotation") {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A node requires its exact annotation and nested-type Source selections.", source?.node);
  }
  for (const child of [source.annotation, source.nested]) {
    if (child === undefined) continue;
    assertCsharpNodeSyntaxChildSource(child);
    if (child.node !== source.node || child.queries !== source.queries || child.state !== source.state) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A node requires its exact annotation and nested-type Source selections.", source.node);
    }
  }
}
