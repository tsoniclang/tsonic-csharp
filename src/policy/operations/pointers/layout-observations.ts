import type { ExtensionFactSubject, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { resolveTsonicMemoryLayoutObservation } from "@tsonic/source-core/facts";

export function selectCsharpLayoutObservation(facts: ReadonlySourceFactResolver | undefined, node: ExtensionFactSubject) {
  const selected = facts === undefined ? undefined : resolveTsonicMemoryLayoutObservation(facts, node);
  if (selected === undefined) return undefined;
  return selected.kind === "rejected"
    ? Object.freeze({ kind: "rejected" as const, operation: "layout-query" as const, reason: selected.reason })
    : Object.freeze({ kind: "layout-query" as const, value: selected.value });
}
