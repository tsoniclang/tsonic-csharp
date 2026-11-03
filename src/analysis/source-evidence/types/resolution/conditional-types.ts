import type { Node, Type, TypeAliasApplicationInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formCsharpConditionalApplicationSource, resolveFormedCsharpConditionalApplication } from "./conditional-application-source.js";
import { formCsharpSemanticConditionalSource, resolveFormedCsharpSemanticConditionalType } from "./semantic-conditional-source.js";

export function resolveCsharpConditionalApplication(
  scope: CsharpTypeResolutionScope,
  application: TypeAliasApplicationInfo,
  arguments_: readonly TargetTypeRef[],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node = application.typeNode,
): TargetTypeRef | undefined {
  if (application.kind !== "conditional" || application.bindings.length !== arguments_.length) return undefined;
  return resolveFormedCsharpConditionalApplication(scope,
    formCsharpConditionalApplicationSource(scope, application, queries, state.sourceStorageSubject, authoredRoot), arguments_, state);
}

export function resolveCsharpSemanticConditionalType(
  scope: CsharpTypeResolutionScope, type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): { readonly type: TargetTypeRef | undefined } | undefined {
  return resolveFormedCsharpSemanticConditionalType(scope,
    formCsharpSemanticConditionalSource(scope, type, queries, state, queries.types.aliasApplication(type)));
}
