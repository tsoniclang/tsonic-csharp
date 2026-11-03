import type { Node, Type, TypeAliasApplicationInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formCsharpSourceTypeBindingEvidence, completeCsharpBoundSourceType,
  type CsharpSourceTypeBindingEvidence } from "./type-bindings.js";
import { csharpConditionalDeclaration, formCsharpConditionalApplicationSource, resolveFormedCsharpConditionalApplication,
  type CsharpConditionalApplicationSource } from "./conditional-application-source.js";
import { nextState } from "./state.js";

interface CsharpConditionalArgumentSource {
  readonly binding: TypeAliasApplicationInfo["bindings"][number];
  readonly source: CsharpSourceTypeBindingEvidence | undefined;
  readonly selectedSourceType: Type;
}

export type CsharpSemanticConditionalSource = {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly sourceApplication: TypeAliasApplicationInfo | undefined;
} & (
  | { readonly kind: "not-applicable" }
  | { readonly kind: "unavailable"; readonly declaration: Node }
  | { readonly kind: "application"; readonly declaration: Node; readonly application: TypeAliasApplicationInfo;
      readonly arguments: readonly CsharpConditionalArgumentSource[]; readonly completion: CsharpConditionalApplicationSource }
);

function captureArguments(
  application: TypeAliasApplicationInfo,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): readonly CsharpConditionalArgumentSource[] {
  return Object.freeze(application.bindings.map(binding => {
    const source = state.sourceBindings === undefined ? undefined : formCsharpSourceTypeBindingEvidence(binding.argument, queries);
    return Object.freeze({ binding, source,
      selectedSourceType: completeCsharpBoundSourceType(source, state)?.sourceType ?? binding.argument });
  }));
}

export function formCsharpSemanticConditionalSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  sourceApplication: TypeAliasApplicationInfo | undefined,
): CsharpSemanticConditionalSource {
  const input = { type, queries, state, sourceApplication };
  const declaration = sourceApplication?.kind !== "conditional" ? undefined : csharpConditionalDeclaration(scope, sourceApplication);
  if (sourceApplication === undefined || declaration === undefined) return Object.freeze({ ...input, kind: "not-applicable" });
  const originalArguments = captureArguments(sourceApplication, queries, state);
  const selectedSources = originalArguments.map(argument => argument.selectedSourceType);
  const changed = selectedSources.some((argument, index) => argument !== sourceApplication.bindings[index]!.argument);
  const application = changed ? queries.types.instantiateAlias(declaration, selectedSources) : sourceApplication;
  if (application === undefined) return Object.freeze({ ...input, kind: "unavailable", declaration });
  return Object.freeze({ ...input, kind: "application", declaration, application,
    arguments: application === sourceApplication ? originalArguments : captureArguments(application, queries, state),
    completion: formCsharpConditionalApplicationSource(scope, application, queries, state.sourceStorageSubject, application.typeNode) });
}

export function resolveFormedCsharpSemanticConditionalType(
  scope: CsharpTypeResolutionScope,
  input: CsharpSemanticConditionalSource,
): { readonly type: TargetTypeRef | undefined } | undefined {
  if (input.kind === "not-applicable") return undefined;
  if (input.sourceApplication?.kind !== "conditional" || input.declaration === undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A semantic conditional requires its exact retained Source application.", input.queries.sourceFile);
  }
  if (input.kind === "unavailable") return Object.freeze({ type: undefined });
  const { application, state, queries } = input;
  if (application === undefined || input.completion === undefined || input.completion.application !== application ||
      input.completion.queries !== queries || input.completion.authoredRoot !== application.typeNode ||
      input.completion.storageSubject !== state.sourceStorageSubject ||
      input.arguments === undefined || input.arguments.length !== application.bindings.length ||
      application.bindings.some((binding, index) => input.arguments[index]?.binding !== binding ||
        input.arguments[index]?.source !== undefined && input.arguments[index]?.source?.type !== binding.argument ||
        input.arguments[index]?.selectedSourceType !== (completeCsharpBoundSourceType(input.arguments[index]?.source, state)?.sourceType ?? binding.argument))) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A semantic conditional requires every exact ordered bound argument Source.", input.declaration);
  }
  const arguments_ = input.arguments.map(argument => completeCsharpBoundSourceType(argument.source, state)?.targetType ??
    scope.resolveTypeWithState(argument.binding.argument, queries.sourceFile, nextState(state)));
  return Object.freeze({ type: arguments_.some(argument => argument === undefined) ? undefined
    : resolveFormedCsharpConditionalApplication(scope, input.completion, arguments_ as readonly TargetTypeRef[], state) });
}
