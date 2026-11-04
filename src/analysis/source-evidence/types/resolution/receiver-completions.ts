import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypeDeclaration, CsharpProjectTypeDefinition } from "../../../../target-model/records/types/project-types.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { nextState } from "./state.js";
import type { CsharpSourceOwnedConstructionSource } from "./expression-source.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { formCsharpProjectInstanceSource, type CsharpProjectInstanceSource } from "./project-instance-source.js";

export interface CsharpSelectedReceiverSource {
  readonly receiver: { readonly expression?: Node; readonly type?: Type } | undefined;
  readonly queries: SourceFileSemantics;
  readonly declaredThis: {
    readonly catalog: Pick<CsharpProjectTypeCatalog, "declarationContaining">;
    readonly owner: CsharpProjectTypeDeclaration | undefined;
  } | undefined;
}

export interface CsharpSelectedReceiverInput {
  readonly source: CsharpSelectedReceiverSource;
  readonly state: CsharpTypeResolutionState;
}

export type CsharpSelectedReceiverCompletion = {
  readonly input: CsharpSelectedReceiverInput;
  readonly type: TargetTypeRef;
} & (
  | { readonly kind: "expression" | "type"; readonly childState: CsharpTypeResolutionState }
  | { readonly kind: "declared-this"; readonly owner: CsharpProjectTypeDefinition }
);

export type CsharpSourceCallReceiverSource = {
  readonly source: ResolvedSourceCallInfo;
  readonly queries: SourceFileSemantics;
  readonly selected: CsharpSelectedReceiverSource;
} & (
  | { readonly kind: "super"; readonly instance: CsharpProjectInstanceSource }
  | { readonly kind: "construction"; readonly projectClass: boolean }
  | { readonly kind: "selected" }
);

export interface CsharpSourceCallReceiverInput {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
  readonly construction: CsharpSourceOwnedConstructionSource | undefined;
  readonly receiverSource: CsharpSourceCallReceiverSource;
}

export type CsharpSourceCallReceiverCompletion = {
  readonly input: CsharpSourceCallReceiverInput;
  readonly type: TargetTypeRef;
} & (
  | { readonly kind: "super" | "construction-result" }
  | { readonly kind: "owned-construction"; readonly projectClass: boolean;
      readonly factory: ReturnType<typeof getCsharpClassFactory> }
  | { readonly kind: "selected"; readonly selected: CsharpSelectedReceiverCompletion }
);

export function formCsharpSelectedReceiverSource(
  host: Pick<CsharpTypeResolutionScope["host"], "ast"> & {
    readonly projectTypeCatalog: Pick<CsharpProjectTypeCatalog, "declarationContaining">;
  },
  receiver: CsharpSelectedReceiverSource["receiver"],
  queries: SourceFileSemantics,
): CsharpSelectedReceiverSource {
  const expression = receiver?.expression;
  const declaredThis = expression === undefined || host.ast.kindName(expression) !== "KindThisKeyword" ? undefined
    : Object.freeze({ catalog: host.projectTypeCatalog, owner: host.projectTypeCatalog.declarationContaining(expression) });
  return Object.freeze({ receiver, queries, declaredThis });
}

export function formCsharpSourceCallReceiverSource(
  host: Pick<CsharpTypeResolutionScope["host"], "ast" | "navigation"> & {
    readonly projectTypeCatalog: Pick<CsharpProjectTypeCatalog, "declarationContaining">;
  },
  source: ResolvedSourceCallInfo,
  queries: SourceFileSemantics,
): CsharpSourceCallReceiverSource {
  const selected = formCsharpSelectedReceiverSource(host, source.sourceReceiver, queries);
  if (host.ast.kindName(source.sourceCallee.expression) === "KindSuperKeyword") {
    return Object.freeze({ source, queries, selected, kind: "super",
      instance: formCsharpProjectInstanceSource(host.ast, source.sourceCallee.expression) });
  }
  if (host.ast.is.IsNewExpression(source.call)) {
    const projectClass = host.ast.is.IsClassDeclaration(source.sourceCallee.selectedDeclaration) &&
      host.navigation.isProjectDeclaration(source.sourceCallee.selectedDeclaration);
    return Object.freeze({ source, queries, selected, kind: "construction", projectClass });
  }
  return Object.freeze({ source, queries, selected, kind: "selected" });
}

export function completeCsharpSelectedReceiver(
  { host, resolveNodeWithState, resolveTypeWithState }: CsharpTypeResolutionScope,
  input: CsharpSelectedReceiverInput,
): CsharpSelectedReceiverCompletion | undefined {
  const { source, state } = input;
  if (source === undefined || !("declaredThis" in source) ||
      source.declaredThis !== undefined && source.declaredThis.catalog !== host.projectTypeCatalog) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Selected receiver completion requires its actual retained Source owner.");
  }
  const { receiver, queries, declaredThis } = source;
  const expressionState = nextState(state);
  const expressionTarget = resolveNodeWithState(receiver?.expression, queries.sourceFile, expressionState);
  if (expressionTarget !== undefined) {
    return Object.freeze({ input, kind: "expression", childState: expressionState, type: expressionTarget });
  }
  const semanticState = nextState(state);
  const semanticTarget = resolveTypeWithState(receiver?.type, queries.sourceFile, semanticState);
  if (semanticTarget !== undefined) {
    return Object.freeze({ input, kind: "type", childState: semanticState, type: semanticTarget });
  }
  if (declaredThis === undefined) return undefined;
  const catalog = host.projectTypeCatalog;
  const owner = declaredThis.owner === undefined ? undefined : catalog.definitionForDeclaration(declaredThis.owner.declaration);
  const type = owner === undefined ? undefined
    : catalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
  return type === undefined || owner === undefined ? undefined : Object.freeze({ input, kind: "declared-this", owner, type });
}
