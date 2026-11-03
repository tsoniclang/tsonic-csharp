import type { Node } from "@tsonic/tsts";
import type { SourceStorageProducer } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function csharpPointerStorageDomainRejection(
  input: CsharpPolicyContext, expression: Node, pointee: TargetTypeRef,
): string | undefined {
  const selected = input.pointerStorage.value(expression);
  if (selected.kind === "unresolved") return selected.issues[0]?.reason ??
    "The bound location requires a completed canonical pointer storage domain.";
  if (selected.includesAbsence) return "The bound location requires a present canonical pointer storage domain.";
  const producers: SourceStorageProducer[] = selected.producers.map(producer => producer.storage);
  if (selected.kind === "open") {
    if (input.sourceStorage === undefined) return "The bound location requires its checked source storage relation.";
    for (const boundary of selected.boundaries) {
      const type = input.sourceStorage.typeFor(boundary.subject);
      if (type.kind === "unresolved") return type.reason;
      producers.push({ subject: boundary.subject, type: type.type, sourceFile: type.sourceFile, bindings: boundary.bindings });
    }
  }
  if (producers.length === 0) return "The bound location has no checked native pointer producer or boundary.";
  for (const producer of producers) {
    const type = input.types.resolvePointerStoragePointee(producer);
    if (type.kind === "unresolved") return type.reason;
    if (!targetTypeRefEquals(type.type, pointee)) return "The selected location and bound field have different C# pointee carriers.";
  }
  return undefined;
}
