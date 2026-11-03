import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { bindCsharpAuthoredTypeSelectionSource, formCsharpAuthoredTypeSelectionSource,
  resolveFormedAuthoredAndSelectedSourceType, type CsharpAuthoredTypeSelectionEvidence,
  type CsharpAuthoredTypeSelectionSource } from "./selected-values.js";
import { nextState } from "./state.js";

export interface CsharpEvidenceNodesCapture {
  readonly inputNodes: readonly Node[];
  readonly nodes: readonly Node[];
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly storageSubject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly requests: readonly {
    readonly node: Node;
    readonly source: CsharpAuthoredTypeSelectionSource;
  }[];
}

export interface CsharpEvidenceNodesSource {
  readonly capture: CsharpEvidenceNodesCapture;
  readonly inputNodes: readonly Node[];
  readonly nodes: readonly Node[];
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly requests: readonly {
    readonly capture: CsharpEvidenceNodesCapture["requests"][number];
    readonly node: Node;
    readonly state: CsharpTypeResolutionState;
    readonly source: CsharpAuthoredTypeSelectionEvidence;
  }[];
}

export function formCsharpEvidenceNodesSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  inputNodes: readonly Node[],
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpEvidenceNodesSource {
  return bindCsharpEvidenceNodesCapture(formCsharpEvidenceNodesCapture(scope,
    inputNodes, selectedType, queries, state.sourceStorageSubject), state);
}

export function formCsharpEvidenceNodesCapture(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  inputNodes: readonly Node[],
  selectedType: Type,
  queries: SourceFileSemantics,
  storageSubject: CsharpTypeResolutionState["sourceStorageSubject"],
): CsharpEvidenceNodesCapture {
  const nodes = Object.freeze([...new Set(inputNodes)]);
  const requests = nodes.map(node => Object.freeze({ node, source: formCsharpAuthoredTypeSelectionSource(scope, node,
    scope.host.ast.getSourceFile(node) ?? queries.sourceFile, selectedType, queries.sourceFile, storageSubject) }));
  return Object.freeze({ inputNodes, nodes, selectedType, queries, storageSubject, requests: Object.freeze(requests) });
}

export function bindCsharpEvidenceNodesCapture(
  capture: CsharpEvidenceNodesCapture,
  state: CsharpTypeResolutionState,
): CsharpEvidenceNodesSource {
  if (capture.storageSubject !== state.sourceStorageSubject || capture.nodes === undefined || capture.requests === undefined ||
      capture.nodes.length !== capture.requests.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Evidence node binding requires its exact captured Source and storage subject.",
      capture.nodes?.[0]);
  }
  for (const [index, node] of capture.nodes.entries()) if (node === undefined ||
        capture.requests[index]?.node !== node || capture.requests[index]?.source?.authoredTypeNode !== node ||
        capture.requests[index]?.source?.selectedType !== capture.selectedType ||
        capture.requests[index]?.source?.selectedSourceFile !== capture.queries.sourceFile ||
        capture.requests[index]?.source?.storage.inputSubject !== capture.storageSubject) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Evidence node binding requires its exact captured Source and storage subject.",
      capture.nodes?.[0]);
  }
  const requests = capture.requests.map(request => {
    const childState = Object.freeze(nextState(state));
    return Object.freeze({ capture: request, node: request.node, state: childState,
      source: bindCsharpAuthoredTypeSelectionSource(request.source, childState) });
  });
  return Object.freeze({ capture, inputNodes: capture.inputNodes, nodes: capture.nodes, selectedType: capture.selectedType,
    queries: capture.queries, state, requests: Object.freeze(requests) });
}

export function resolveFormedCsharpEvidenceNodesToCommonTarget(
  scope: CsharpTypeResolutionScope,
  input: CsharpEvidenceNodesSource,
): TargetTypeRef | undefined {
  if (input.capture === undefined || input.inputNodes !== input.capture.inputNodes || input.nodes !== input.capture.nodes ||
      input.selectedType !== input.capture.selectedType || input.queries !== input.capture.queries ||
      input.state?.sourceStorageSubject !== input.capture.storageSubject ||
      input.nodes === undefined || input.requests === undefined || input.nodes.length !== input.requests.length ||
      input.nodes.some((node, index) => input.requests[index]?.node !== node ||
        input.requests[index]?.capture !== input.capture.requests[index] ||
        input.requests[index]?.source?.source !== input.capture.requests[index]?.source ||
        input.requests[index]?.source?.authoredTypeNode !== node ||
        input.requests[index]?.source?.selectedType !== input.selectedType ||
        input.requests[index]?.source?.selectedSourceFile !== input.queries.sourceFile ||
        input.requests[index]?.source?.inputState !== input.requests[index]?.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Evidence nodes require every exact retained authored selection.", input.nodes?.[0]);
  }
  if (input.requests.length === 0) return undefined;
  const targets = input.requests.map(request => resolveFormedAuthoredAndSelectedSourceType(scope, request.source));
  if (targets.some(target => target === undefined)) return undefined;
  const first = targets[0]!;
  return targets.every(target => target !== undefined && targetTypeRefEquals(first, target)) ? first : undefined;
}
