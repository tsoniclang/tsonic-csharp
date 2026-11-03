import type { SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formAuthoredAndSelectedSourceType, resolveFormedAuthoredAndSelectedSourceType,
  resolveSourceTypeDependency, type CsharpAuthoredTypeSelectionEvidence,
  type CsharpSourceTypeDependency } from "./selected-values.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageContext } from "./source-storage-projection.js";
import { nextState } from "./state.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpSourceTypeComponentSource {
  readonly component: SourceTypeComponentEvidence;
  readonly queries: SourceFileSemantics;
  readonly inputState: CsharpTypeResolutionState;
  readonly state: CsharpTypeResolutionState;
  readonly childState: CsharpTypeResolutionState;
  readonly checked:
    | { readonly kind: "semantic"; readonly request: Extract<CsharpSourceTypeDependency, { readonly kind: "type" }> }
    | { readonly kind: "authored"; readonly source: CsharpAuthoredTypeSelectionEvidence };
}

export function formCsharpSourceTypeComponentSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  inputState: CsharpTypeResolutionState,
): CsharpSourceTypeComponentSource {
  const storage = formCsharpSourceStorageContext(host, inputState.sourceStorageSubject, component.declaration);
  const state = Object.freeze(bindCsharpSourceStorageContext(storage, inputState));
  const childState = Object.freeze(nextState(state));
  const authoredSourceFile = component.authoredTypeNode === undefined ? queries.sourceFile
    : host.ast.getSourceFile(component.authoredTypeNode) ?? queries.sourceFile;
  const checked: CsharpSourceTypeComponentSource["checked"] = component.authoredTypeNode === undefined
    ? Object.freeze({ kind: "semantic", request: Object.freeze({ kind: "type", type: component.selectedType,
        sourceFile: queries.sourceFile, state: childState }) })
    : Object.freeze({ kind: "authored", source: formAuthoredAndSelectedSourceType({ host },
        component.authoredTypeNode, authoredSourceFile, component.selectedType, queries.sourceFile, childState) });
  return Object.freeze({ component, queries, inputState, state, childState, checked });
}

export function resolveFormedCsharpSourceTypeComponent(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceTypeComponentSource,
): TargetTypeRef | undefined {
  const { component, queries, checked } = input;
  if (checked.kind === "semantic") {
    if (component.authoredTypeNode !== undefined || checked.request.type !== component.selectedType ||
      checked.request.sourceFile !== queries.sourceFile || checked.request.state !== input.childState) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked component requires its exact retained semantic child.", component.declaration);
    }
    return resolveSourceTypeDependency(scope, checked.request);
  }
  if (checked.source.authoredTypeNode !== component.authoredTypeNode ||
    checked.source.selectedType !== component.selectedType || checked.source.selectedSourceFile !== queries.sourceFile ||
    checked.source.inputState !== input.childState) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked component requires its exact retained authored child.", component.declaration);
  }
  return resolveFormedAuthoredAndSelectedSourceType(scope, checked.source);
}
