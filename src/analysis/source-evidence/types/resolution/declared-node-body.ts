import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpContextualTypeEvidence } from "../../../../target-model/records/program/source-evidence.js";
import type { CsharpNodeQuerySource, CsharpSemanticTypeSource } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { formCsharpTypeParameterSource, resolveFormedCsharpTypeParameterSource,
  type CsharpTypeParameterSource } from "./source-evidence.js";
import { formCsharpAuthoredTypeSelectionSource, bindCsharpAuthoredTypeSelectionSource,
  resolveFormedAuthoredAndSelectedSourceType, type CsharpAuthoredTypeSelectionSource } from "./selected-values.js";
import { resolveFormedCsharpDirectSourceFacts } from "./direct-source-evidence.js";
import { resolveFormedCsharpSemanticTypeSource } from "./semantic-types.js";
import { completeCsharpBoundSourceType } from "./type-bindings.js";
import { resolveFormedCsharpNodeLiteralSource, resolveFormedCsharpNodeSyntaxChild } from "./nodes.js";

export type CsharpDeclaredNodeBodySource = {
  readonly source: CsharpNodeQuerySource;
  readonly contextual: ReturnType<SourceFileSemantics["types"]["contextualType"]>;
} & (
  | { readonly kind: "not-component" }
  | { readonly kind: "component"; readonly semantic: Extract<CsharpSemanticTypeSource, { readonly kind: "type" }>;
      readonly parameter: CsharpTypeParameterSource;
      readonly contextualSource: CsharpAuthoredTypeSelectionSource | undefined }
);

export type CsharpDeclaredNodeBody = { readonly source: CsharpNodeQuerySource } & (
  | { readonly kind: "not-component" }
  | { readonly kind: "component"; readonly type: TargetTypeRef | undefined;
      readonly storageType: TargetTypeRef | undefined;
      readonly contextualType: CsharpContextualTypeEvidence | undefined;
      readonly components: readonly (TargetTypeRef | undefined)[] }
);

export function formCsharpDeclaredNodeBodySource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  source: CsharpNodeQuerySource,
  contextual: ReturnType<SourceFileSemantics["types"]["contextualType"]>,
): CsharpDeclaredNodeBodySource {
  if (source.root.node !== source.node || source.root.sourceFile !== source.sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
    "A body component requires its original query occurrence.", source.node);
  const root = source.root;
  if (root.kind !== "node" || root.value.kind === "binding" || root.semantic.kind !== "type" || root.branches.arrayLiteral) {
    return Object.freeze({ kind: "not-component", source, contextual });
  }
  const semantic = root.semantic;
  const parameter = formCsharpTypeParameterSource(semantic.type, semantic.queries, scope.host.ast);
  const types = semantic.queries.types;
  if (parameter.parameter === undefined && !types.isBooleanLike(semantic.type) && !types.isNumberLike(semantic.type) &&
    !types.isStringLike(semantic.type) && !types.isBigIntLike(semantic.type) && !types.isNullish(semantic.type) &&
    !types.isVoidLike(semantic.type) && !types.isArrayLike(semantic.type)) {
    return Object.freeze({ kind: "not-component", source, contextual });
  }
  const contextualSource = contextual === undefined ? undefined : formCsharpAuthoredTypeSelectionSource(scope,
    contextual.authoredTypeNode, scope.host.ast.getSourceFile(contextual.authoredTypeNode) ?? semantic.sourceFile,
    contextual.selectedType, semantic.sourceFile, undefined);
  return Object.freeze({ kind: "component", source, contextual, semantic, parameter, contextualSource });
}

export function resolveFormedCsharpDeclaredNodeBody(
  scope: CsharpTypeResolutionScope,
  input: CsharpDeclaredNodeBodySource,
): CsharpDeclaredNodeBody {
  const { source, contextual } = input;
  const root = source.root;
  if (root.node !== source.node || root.sourceFile !== source.sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
    "A body completion requires its original captured query occurrence.", source.node);
  if (input.kind === "not-component") return Object.freeze({ kind: "not-component", source });
  const { semantic, parameter, contextualSource } = input;
  if (root.kind !== "node" || root.semantic !== semantic || parameter.type !== semantic.type ||
    parameter.queries !== semantic.queries ||
    (contextual === undefined) !== (contextualSource === undefined) || contextualSource !== undefined &&
      (contextualSource.authoredTypeNode !== contextual!.authoredTypeNode ||
        contextualSource.selectedType !== contextual!.selectedType || contextualSource.selectedSourceFile !== semantic.sourceFile)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A body component keeps its exact captured type and contextual source.", source.node);
  }
  const direct = resolveFormedCsharpDirectSourceFacts(scope, root.directSyntax);
  const bound = completeCsharpBoundSourceType(semantic.binding, semantic.state);
  const type = direct ?? (root.syntax.annotation !== undefined
    ? resolveFormedCsharpNodeSyntaxChild(scope, root.syntax.annotation)?.selectedType
    : resolveFormedCsharpDirectSourceFacts(scope, root.directValue) ??
      resolveFormedCsharpNodeLiteralSource(scope.host, root.branches)?.selectedType ?? bound?.targetType ??
      (parameter.parameter === undefined ? resolveFormedCsharpSemanticTypeSource(scope, semantic)
        : resolveFormedCsharpTypeParameterSource(parameter, scope.host.typeParameterConstraints)));
  const declared = root.value.kind === "value" && root.value.body?.kind === "available" ? root.value.body.declared : undefined;
  const storageType = declared?.type === undefined ? type
    : scope.resolveTypeWithState(declared.type, declared.sourceFile, declared.state);
  const contextualType = contextual === undefined || contextualSource === undefined ? undefined : Object.freeze({ ...contextual,
    targetType: resolveFormedAuthoredAndSelectedSourceType(scope,
      bindCsharpAuthoredTypeSelectionSource(contextualSource, Object.freeze({ depth: 0 }))) });
  return Object.freeze({ kind: "component", source, type, storageType, contextualType,
    components: Object.freeze([type, storageType]) });
}
