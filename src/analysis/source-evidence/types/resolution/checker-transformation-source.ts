import type { Node, Type } from "@tsonic/tsts";
import { sourceTransformedTypeFactEvidenceNodes, sourceTupleElementTypeEvidenceNodes,
  type SourceFileSemantics, type SourceStandardTypeTransformation } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formCsharpEvidenceNodesSource, resolveFormedCsharpEvidenceNodesToCommonTarget,
  type CsharpEvidenceNodesSource } from "./evidence-node-source.js";
import { formCsharpCallableTypeSource } from "./callable-signature-source.js";
import { formCsharpCallableTypeInput, type CsharpCallableTypeInput } from "./callable-signature-completion.js";
import { resolveFormedCsharpCallableType } from "./source-profiles.js";
import { formCsharpStandardTypeTransformationSource, resolveFormedCsharpStandardTypeTransformation,
  type CsharpStandardTypeTransformationSource } from "./standard-transformation-source.js";
import { formCsharpStructuralTypeSourceInput, type CsharpStructuralTypeSourceInput } from "./root-sources.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { nextState } from "./state.js";

type TupleElement = ReturnType<SourceFileSemantics["types"]["tupleElementInfos"]>[number];

export type CsharpCheckerTransformationSource = {
  readonly authoredRoot: Node;
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "standard"; readonly standard: CsharpStandardTypeTransformationSource }
  | { readonly kind: "tuple"; readonly direct: CsharpEvidenceNodesSource;
      readonly infos: readonly TupleElement[];
      readonly elements: readonly { readonly element: TupleElement; readonly state: CsharpTypeResolutionState;
        readonly evidence: CsharpEvidenceNodesSource }[] }
  | { readonly kind: "value"; readonly direct: CsharpEvidenceNodesSource;
      readonly callable: CsharpCallableTypeInput; readonly structural: CsharpStructuralTypeSourceInput }
);

export function formCsharpCheckerTransformationSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  authoredRoot: Node,
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  standard: SourceStandardTypeTransformation | undefined,
): CsharpCheckerTransformationSource {
  const input = { authoredRoot, selectedType, queries, state };
  if (standard !== undefined) return Object.freeze({ ...input, kind: "standard",
    standard: formCsharpStandardTypeTransformationSource(scope, standard, queries, state, authoredRoot, selectedType) });
  const direct = formCsharpEvidenceNodesSource(scope,
    sourceTransformedTypeFactEvidenceNodes(scope.host.ast, queries, authoredRoot, selectedType), selectedType, queries, state);
  if (queries.types.isTuple(selectedType)) {
    const infos = queries.types.tupleElementInfos(selectedType);
    const elements = infos.map((element, index) => {
      const elementState = Object.freeze(csharpSourceStorageComponentContext(scope.host, state, { kind: "tuple-element", index }));
      return Object.freeze({ element, state: elementState, evidence: formCsharpEvidenceNodesSource(scope, [
        ...sourceTupleElementTypeEvidenceNodes(scope.host.ast, queries, element),
        ...sourceTransformedTypeFactEvidenceNodes(scope.host.ast, queries, authoredRoot, element.type),
      ], element.type, queries, elementState) });
    });
    return Object.freeze({ ...input, kind: "tuple", direct, infos, elements: Object.freeze(elements) });
  }
  return Object.freeze({ ...input, kind: "value", direct,
    callable: formCsharpCallableTypeInput(scope.host, formCsharpCallableTypeSource(scope.host.ast, selectedType, queries), state),
    structural: formCsharpStructuralTypeSourceInput(scope, selectedType, scope.host.semantics(queries.sourceFile),
      nextState(state), authoredRoot) });
}

export function resolveFormedCsharpCheckerTransformation(
  scope: CsharpTypeResolutionScope,
  input: CsharpCheckerTransformationSource,
): TargetTypeRef | undefined {
  const { selectedType, queries, state, authoredRoot } = input;
  if (input.kind === "standard") {
    if (input.standard === undefined || input.standard.selectedType !== selectedType || input.standard.queries !== queries ||
        input.standard.state !== state || input.standard.authoredRoot !== authoredRoot) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A checker transformation requires its exact retained standard Source.", authoredRoot);
    }
    return resolveFormedCsharpStandardTypeTransformation(scope, input.standard);
  }
  if (input.direct === undefined || input.direct.selectedType !== selectedType || input.direct.queries !== queries || input.direct.state !== state) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A checker transformation requires its exact retained direct evidence.", authoredRoot);
  }
  const direct = resolveFormedCsharpEvidenceNodesToCommonTarget(scope, input.direct);
  if (direct !== undefined) return direct;
  if (input.kind === "tuple") {
    if (input.infos === undefined || input.elements === undefined || input.infos.length !== input.elements.length ||
        input.infos.some((element, index) => input.elements[index]?.element !== element ||
          input.elements[index]?.evidence.selectedType !== element.type || input.elements[index]?.evidence.queries !== queries ||
          input.elements[index]?.evidence.state !== input.elements[index]?.state)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A checker transformation requires every exact ordered tuple input.", authoredRoot);
    }
    const elements = input.elements.map(element => resolveFormedCsharpEvidenceNodesToCommonTarget(scope, element.evidence) ??
      scope.resolveTypeWithState(element.element.type, queries.sourceFile, nextState(element.state)));
    return input.infos.length === 0 || elements.some(element => element === undefined) ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
  }
  if (input.callable === undefined || input.callable.source.type !== selectedType || input.callable.source.queries !== queries ||
      input.callable.state !== state || input.structural === undefined || input.structural.type !== selectedType ||
      input.structural.queries.sourceFile !== queries.sourceFile || input.structural.authoredTypeRoot !== authoredRoot) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A checker transformation requires its exact retained callable and structural inputs.", authoredRoot);
  }
  const callable = resolveFormedCsharpCallableType(scope, input.callable);
  return callable ?? scope.host.structuralTypes.completeTypeSource(input.structural);
}
