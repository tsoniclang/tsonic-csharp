import type { SourceStorageBindings, SourceStorageQueries, SourceStorageSubject } from "@tsonic/target-api/analysis";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";

export function createCsharpJsonPayloadFrontier(
  storage: Pick<SourceStorageQueries, "nodes" | "subjectFor" | "boundValueFrontierFor">,
  reads: CsharpValueReadClassifications,
  reserve: (amount: number) => void,
) {
  const boundaries: SourceStorageSubject[] = [];
  const carriers = new Map<SourceStorageSubject, TargetTypeRef>();
  for (const node of storage.nodes) {
    reserve(1);
    const carrier = reads.valueRead.get(node)?.narrowedRead;
    if (carrier === undefined || isCsharpJsValueTargetType(carrier)) continue;
    const selected = storage.subjectFor(node);
    if (selected.kind !== "resolved" || selected.subject.kind !== "value" ||
      selected.subject.node !== node || selected.subject.projection.length !== 0) continue;
    boundaries.push(selected.subject);
    carriers.set(selected.subject, carrier);
  }
  const selectedBoundaries = Object.freeze(boundaries);
  return Object.freeze({
    select: (subject: SourceStorageSubject, bindings: SourceStorageBindings) =>
      storage.boundValueFrontierFor(subject, bindings, selectedBoundaries),
    carrierFor: (subject: SourceStorageSubject) => carriers.get(subject),
  });
}
