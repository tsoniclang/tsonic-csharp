import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPropertyValueProjectionEmission, CsharpPropertyValueProjectionRecords } from "../../../target-model/records/property-value-projection.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpPropertyValueProjectionProducer() {
  const values = new Map<Node, Map<string, CsharpPropertyValueProjectionEmission>>();
  let closed = false;
  const records: CsharpPropertyValueProjectionRecords = Object.freeze({ propertyValueProjection: Object.freeze({
    get: (node: Node, source: TargetTypeRef) => values.get(node)?.get(targetTypeRefKey(source)),
  }) });
  return Object.freeze({ records,
    publish(node: Node, source: TargetTypeRef, value: CsharpPropertyValueProjectionEmission): void {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Property projections cannot change after sealing.", node);
      const entries = values.get(node) ?? new Map<string, CsharpPropertyValueProjectionEmission>();
      const key = targetTypeRefKey(source);
      if (entries.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "A property projection has one exact selected source case.", node);
      entries.set(key, Object.freeze(value)); values.set(node, entries);
    },
    seal(): CsharpPropertyValueProjectionRecords { closed = true; return records; },
  });
}
