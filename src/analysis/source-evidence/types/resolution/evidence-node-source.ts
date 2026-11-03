import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formAuthoredAndSelectedSourceType, resolveFormedAuthoredAndSelectedSourceType,
  type CsharpAuthoredTypeSelectionEvidence } from "./selected-values.js";
import { nextState } from "./state.js";

export interface CsharpEvidenceNodesSource {
  readonly inputNodes: readonly Node[];
  readonly nodes: readonly Node[];
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly requests: readonly {
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
  const nodes = Object.freeze([...new Set(inputNodes)]);
  const requests = nodes.map(node => {
    const childState = Object.freeze(nextState(state));
    return Object.freeze({ node, state: childState, source: formAuthoredAndSelectedSourceType(scope, node,
      scope.host.ast.getSourceFile(node) ?? queries.sourceFile, selectedType, queries.sourceFile, childState) });
  });
  return Object.freeze({ inputNodes, nodes, selectedType, queries, state, requests: Object.freeze(requests) });
}

export function resolveFormedCsharpEvidenceNodesToCommonTarget(
  scope: CsharpTypeResolutionScope,
  input: CsharpEvidenceNodesSource,
): TargetTypeRef | undefined {
  if (input.nodes === undefined || input.requests === undefined || input.nodes.length !== input.requests.length ||
      input.nodes.some((node, index) => input.requests[index]?.node !== node ||
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
