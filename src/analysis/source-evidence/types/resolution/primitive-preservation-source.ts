import { sourcePrimitiveFactKey, type Node, type SourcePrimitiveKind } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export interface CsharpPrimitivePreservationSource {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly required: readonly SourcePrimitiveKind[];
}

export function formCsharpPrimitivePreservationSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
): CsharpPrimitivePreservationSource {
  const required = new Set(queries.facts.authoredTypeSubjects(node).flatMap(subject => {
    const primitive = host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey)?.kind;
    return primitive === undefined ? [] : [primitive];
  }));
  return Object.freeze({ node, queries, required: Object.freeze([...required]) });
}

export function completeCsharpPrimitivePreservation(
  { collectTargetSourcePrimitiveNames }: Pick<CsharpTypeResolutionScope, "collectTargetSourcePrimitiveNames">,
  source: CsharpPrimitivePreservationSource,
  target: TargetTypeRef,
): boolean {
  if (source.required.length === 0) return true;
  const preserved = new Set<string>();
  collectTargetSourcePrimitiveNames(target, preserved, new Set());
  return source.required.every(kind => preserved.has(kind));
}
