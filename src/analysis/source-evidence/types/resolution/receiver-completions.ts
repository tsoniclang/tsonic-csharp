import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpProjectTypeDefinition } from "../../../../target-model/records/types/project-types.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { nextState } from "./state.js";

export interface CsharpSelectedReceiverInput {
  readonly receiver: { readonly expression?: Node; readonly type?: Type } | undefined;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
}

export type CsharpSelectedReceiverCompletion = {
  readonly input: CsharpSelectedReceiverInput;
  readonly type: TargetTypeRef;
} & (
  | { readonly kind: "expression" | "type"; readonly childState: CsharpTypeResolutionState }
  | { readonly kind: "declared-this"; readonly owner: CsharpProjectTypeDefinition }
);

export interface CsharpSourceCallReceiverInput {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
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

export function completeCsharpSelectedReceiver(
  { host, resolveNodeWithState, resolveTypeWithState }: CsharpTypeResolutionScope,
  input: CsharpSelectedReceiverInput,
): CsharpSelectedReceiverCompletion | undefined {
  const { receiver, queries, state } = input;
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
  if (receiver?.expression === undefined || host.ast.kindName(receiver.expression) !== "KindThisKeyword") {
    return undefined;
  }
  const owner = host.projectTypeCatalog.definitionContainingDeclaration(receiver.expression);
  const type = owner === undefined ? undefined
    : host.projectTypeCatalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
  return type === undefined || owner === undefined ? undefined : Object.freeze({ input, kind: "declared-this", owner, type });
}
