import type { Node } from "@tsonic/tsts";
import type { SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpPointerBackingProducer, CsharpPointerBackingUse } from "../../target-model/records/storage/pointer-backing.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import { resolveCsharpPointerStoragePointee } from "../storage/pointer-pointee.js";
import { represented } from "../../policy/types/source-type-flow/representation-results.js";

export function createCsharpPointerBackingDemands(
  policy: Pick<CsharpPolicyContext, "sourceStorage" | "representation" | "providers">,
) {
  const uses: CsharpPointerBackingUse[] = [];
  const issues: { readonly node: Node; readonly reason: string }[] = [];
  const completed = new Set<Node>();
  let open = true;
  return Object.freeze({
    seal() {
      if (!open) throw new TypeError("Pointer backing demands seal exactly once.");
      open = false;
      return Object.freeze({ uses: Object.freeze([...uses]), issues: Object.freeze([...issues]) });
    },
    record(node: Node): CsharpRepresentationOutcome<void> | Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }> {
      if (!open) throw new TypeError("Pointer backing demand production is closed after sealing.");
      const bindings = policy.sourceStorage.bindingsForLexicalOwner(node);
      if (bindings.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: bindings });
      if (bindings.kind === "unresolved") return bindings;
      const selected = policy.sourceStorage.memory.rawLocation.resolve(node, bindings.bindings);
      if (selected.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: selected });
      if (selected.kind === "unresolved") return selected;
      if (completed.has(node)) return represented(undefined);
      if (selected.value.kind === "none" || selected.value.value.operation.operation !== "to-raw") return represented(undefined);
      const operation = selected.value.value.operation;
      const subject = policy.sourceStorage.subject(operation.pointer.occurrence);
      if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
      if (subject.kind === "unresolved") return subject;
      const backing = policy.sourceStorage.memory.pointerBacking.value(subject.subject, bindings.bindings);
      if (backing.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: backing });
      if (backing.kind === "unresolved") return backing;
      if (backing.value.kind === "open") {
        for (const boundary of backing.value.boundaries) issues.push(Object.freeze({
          node: boundary.exposure,
          reason: `Physical pointer backing requires a closed source storage domain (${boundary.kind}).`,
        }));
        completed.add(node);
        return represented(undefined);
      }
      const producers: CsharpPointerBackingProducer[] = [];
      const unresolved: { readonly node: Node; readonly reason: string }[] = [];
      for (const producer of backing.value.producers) {
        const pointee = resolveCsharpPointerStoragePointee(policy, producer.storage);
        if (pointee.kind !== "represented") return pointee;
        if (pointee.value.kind === "unresolved") unresolved.push(Object.freeze({
          node: producer.operation.occurrence, reason: pointee.value.reason,
        }));
        else producers.push(Object.freeze({ source: producer, pointeeType: pointee.value.type }));
      }
      issues.push(...unresolved);
      if (producers.length === backing.value.producers.length) uses.push(Object.freeze({
        call: node, producers: Object.freeze(producers), includesAbsence: backing.value.includesAbsence,
        layout: selected.value.value.layout, typeBindings: selected.value.value.typeBindings,
      }));
      completed.add(node);
      return represented(undefined);
    },
  });
}
