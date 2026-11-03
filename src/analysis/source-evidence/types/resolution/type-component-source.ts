import type { SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { formCsharpAuthoredTypeSelectionSource, bindCsharpAuthoredTypeSelectionSource, resolveFormedAuthoredAndSelectedSourceType,
  resolveSourceTypeDependency, type CsharpAuthoredTypeSelectionSource, type CsharpAuthoredTypeSelectionEvidence,
  type CsharpSourceTypeDependency } from "./selected-values.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageContext,
  type CsharpSourceStorageContextSource } from "./source-storage-projection.js";
import { nextState } from "./state.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpSourceTypeComponentCapture {
  readonly component: SourceTypeComponentEvidence;
  readonly queries: SourceFileSemantics;
  readonly storage: CsharpSourceStorageContextSource;
  readonly checked:
    | { readonly kind: "semantic"; readonly type: SourceTypeComponentEvidence["selectedType"] }
    | { readonly kind: "authored"; readonly source: CsharpAuthoredTypeSelectionSource };
}

export interface CsharpSourceTypeComponentSource {
  readonly capture: CsharpSourceTypeComponentCapture;
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
  { host }: { readonly host: CsharpTypePolicyBaseHost },
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  inputState: CsharpTypeResolutionState,
): CsharpSourceTypeComponentSource {
  return bindCsharpSourceTypeComponentCapture(formCsharpSourceTypeComponentCapture({ host },
    component, queries, inputState.sourceStorageSubject), inputState);
}

export function formCsharpSourceTypeComponentCapture(
  { host }: { readonly host: CsharpTypePolicyBaseHost },
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  inputSubject: CsharpTypeResolutionState["sourceStorageSubject"],
): CsharpSourceTypeComponentCapture {
  const storage = formCsharpSourceStorageContext(host, inputSubject, component.declaration);
  const authoredSourceFile = component.authoredTypeNode === undefined ? queries.sourceFile
    : host.ast.getSourceFile(component.authoredTypeNode) ?? queries.sourceFile;
  const checked: CsharpSourceTypeComponentCapture["checked"] = component.authoredTypeNode === undefined
    ? Object.freeze({ kind: "semantic", type: component.selectedType })
    : Object.freeze({ kind: "authored", source: formCsharpAuthoredTypeSelectionSource({ host },
        component.authoredTypeNode, authoredSourceFile, component.selectedType, queries.sourceFile, storage.subject) });
  return Object.freeze({ component, queries, storage, checked });
}

export function bindCsharpSourceTypeComponentCapture(
  capture: CsharpSourceTypeComponentCapture,
  inputState: CsharpTypeResolutionState,
): CsharpSourceTypeComponentSource {
  const { component, queries } = capture;
  if (capture.checked.kind === "semantic"
    ? component.authoredTypeNode !== undefined || capture.checked.type !== component.selectedType
    : capture.checked.source.authoredTypeNode !== component.authoredTypeNode ||
      capture.checked.source.selectedType !== component.selectedType ||
      capture.checked.source.selectedSourceFile !== queries.sourceFile) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A component binding requires its exact captured selection.", component.declaration);
  }
  const state = Object.freeze(bindCsharpSourceStorageContext(capture.storage, inputState));
  const childState = Object.freeze(nextState(state));
  const checked: CsharpSourceTypeComponentSource["checked"] = capture.checked.kind === "semantic"
    ? Object.freeze({ kind: "semantic", request: Object.freeze({ kind: "type", type: capture.checked.type,
        sourceFile: queries.sourceFile, state: childState }) })
    : Object.freeze({ kind: "authored", source: bindCsharpAuthoredTypeSelectionSource(capture.checked.source, childState) });
  return Object.freeze({ capture, component, queries, inputState, state, childState, checked });
}

export function resolveFormedCsharpSourceTypeComponent(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceTypeComponentSource,
): TargetTypeRef | undefined {
  const { capture, component, queries, checked } = input;
  if (capture === undefined || capture.component !== component || capture.queries !== queries || checked.kind !== capture.checked.kind ||
      capture.storage.inputSubject !== input.inputState.sourceStorageSubject ||
      capture.storage.subject !== input.state.sourceStorageSubject) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked component requires its exact retained Source capture and bound state.", component.declaration);
  }
  if (checked.kind === "semantic") {
    if (component.authoredTypeNode !== undefined || checked.request.type !== component.selectedType ||
      checked.request.sourceFile !== queries.sourceFile || checked.request.state !== input.childState) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked component requires its exact retained semantic child.", component.declaration);
    }
    return resolveSourceTypeDependency(scope, checked.request);
  }
  if (capture.checked.kind !== "authored" || checked.source.source !== capture.checked.source ||
    checked.source.authoredTypeNode !== component.authoredTypeNode ||
    checked.source.selectedType !== component.selectedType || checked.source.selectedSourceFile !== queries.sourceFile ||
    checked.source.inputState !== input.childState) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked component requires its exact retained authored child.", component.declaration);
  }
  return resolveFormedAuthoredAndSelectedSourceType(scope, checked.source);
}
