import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpNeverTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { formCsharpSourceTypeComponentSource, type CsharpSourceTypeComponentSource } from "./type-component-source.js";
import { formCsharpSignatureParameterCapture, bindCsharpSignatureParameterCapture,
  type CsharpSignatureParameterInput } from "./signature-parameter-source.js";
import { formCsharpCallableDeclaration } from "./callable-type-parameters.js";
import { formCsharpCallableSignatureSource } from "./callable-signature-source.js";
import { formCsharpCallableSignatureInput, type CsharpCallableSignatureInput } from "./callable-signature-completion.js";
import { formCsharpStructuralTypeSourceInput, type CsharpStructuralTypeSourceInput } from "./root-sources.js";
import { nextState } from "./state.js";

type Transformation = NonNullable<ReturnType<SourceFileSemantics["types"]["standardTransformation"]>>;

export type CsharpStandardTypeTransformationSource = {
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly authoredRoot: Node;
  readonly selectedType: Type;
} & (
  | { readonly kind: "unresolved"; readonly transformation: Extract<Transformation, { readonly kind: "unresolved" }> }
  | { readonly kind: "never"; readonly transformation: Extract<Transformation, { readonly kind: "non-nullish" }> }
  | { readonly kind: "component" | "non-nullish";
      readonly transformation: Extract<Transformation, { readonly kind: "component" | "non-nullish" }>;
      readonly component: CsharpSourceTypeComponentSource }
  | { readonly kind: "parameter-list"; readonly transformation: Extract<Transformation, { readonly kind: "parameter-list" }>;
      readonly parameters: readonly CsharpSignatureParameterInput[] }
  | { readonly kind: "structural"; readonly transformation: Extract<Transformation, { readonly kind: "structural" }>;
      readonly structural: CsharpStructuralTypeSourceInput }
  | { readonly kind: "callable"; readonly transformation: Extract<Transformation, { readonly kind: "callable" }>;
      readonly callable: CsharpCallableSignatureInput }
);

export function formCsharpStandardTypeTransformationSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  transformation: Transformation,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node,
  selectedType: Type,
): CsharpStandardTypeTransformationSource {
  const input = { transformation, queries, state, authoredRoot, selectedType };
  if (transformation.kind === "unresolved") return Object.freeze({ ...input, kind: "unresolved", transformation });
  if (transformation.kind === "non-nullish" && queries.types.isNever(selectedType)) {
    return Object.freeze({ ...input, kind: "never", transformation });
  }
  if (transformation.kind === "component" || transformation.kind === "non-nullish") {
    return Object.freeze({ ...input, kind: transformation.kind, transformation,
      component: formCsharpSourceTypeComponentSource(scope, transformation.component, queries, state) });
  }
  if (transformation.kind === "parameter-list") {
    return Object.freeze({ ...input, kind: "parameter-list", transformation,
      parameters: Object.freeze(transformation.parameters.map(parameter => bindCsharpSignatureParameterCapture(
        formCsharpSignatureParameterCapture(scope.host, parameter, queries, "parameter-list", state.sourceStorageSubject), state))) });
  }
  if (transformation.kind === "structural") {
    return Object.freeze({ ...input, kind: "structural", transformation,
      structural: formCsharpStructuralTypeSourceInput(scope, selectedType, scope.host.semantics(queries.sourceFile),
        nextState(state), authoredRoot) });
  }
  return Object.freeze({ ...input, kind: "callable", transformation,
    callable: formCsharpCallableSignatureInput(scope.host,
      formCsharpCallableSignatureSource(scope.host.ast, transformation.callable, queries,
        formCsharpCallableDeclaration(transformation.callable.result.declaration, queries.sourceFile, scope.host.ast)), state) });
}

export function resolveFormedCsharpStandardTypeTransformation(
  scope: Pick<CsharpTypeResolutionScope, "host" | "resolveFormedSourceTypeComponentEvidence" |
    "resolveFormedSignatureParameterEvidence" | "resolveSignatureParameterListTarget" | "resolveFormedCallableEvidence">,
  input: CsharpStandardTypeTransformationSource,
): TargetTypeRef | undefined {
  if (input.transformation === undefined || (input.kind === "never"
    ? input.transformation.kind !== "non-nullish" : input.kind !== input.transformation.kind)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked transformation requires its exact retained Source decision.", input.authoredRoot);
  }
  if (input.kind === "unresolved") return undefined;
  if (input.kind === "never") return csharpNeverTargetType();
  if (input.kind === "component" || input.kind === "non-nullish") {
    if (input.component === undefined || input.component.component !== input.transformation.component ||
        input.component.queries !== input.queries || input.component.inputState !== input.state) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked transformation requires its exact retained component.", input.authoredRoot);
    }
    const type = scope.resolveFormedSourceTypeComponentEvidence(input.component);
    return input.kind === "non-nullish" ? getCsharpNullableElementTargetType(type) ?? type : type;
  }
  if (input.kind === "parameter-list") {
    const parameters = input.transformation.parameters;
    if (input.parameters === undefined || input.parameters.length !== parameters.length || parameters.some((parameter, index) =>
      input.parameters[index]?.capture.parameter !== parameter || input.parameters[index]?.capture.queries !== input.queries ||
      input.parameters[index]?.capture.use !== "parameter-list" || input.parameters[index]?.state !== input.state)) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked transformation requires every exact ordered parameter input.", input.authoredRoot);
    }
    const elements = input.parameters.map(parameter => scope.resolveFormedSignatureParameterEvidence(parameter));
    return elements.some(element => element === undefined) ? undefined
      : scope.resolveSignatureParameterListTarget(parameters, elements as readonly TargetTypeRef[]);
  }
  if (input.kind === "structural") {
    if (input.structural === undefined || input.structural.type !== input.selectedType ||
        input.structural.queries.sourceFile !== input.queries.sourceFile || input.structural.authoredTypeRoot !== input.authoredRoot) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked transformation requires its exact retained structural input.", input.authoredRoot);
    }
    return scope.host.structuralTypes.completeTypeSource(input.structural);
  }
  if (input.callable === undefined || input.callable.source.callable !== input.transformation.callable ||
      input.callable.source.queries !== input.queries || input.callable.state !== input.state) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked transformation requires its exact retained callable input.", input.authoredRoot);
  }
  return scope.resolveFormedCallableEvidence(input.callable);
}
