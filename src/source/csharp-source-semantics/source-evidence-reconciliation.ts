import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "./target-ref-utils.js";

/**
 * Why one side of an authored/selected pair was chosen. Carried so callers can
 * attach exact evidence to facts and diagnostics instead of restating a rule.
 */
export type SourceEvidenceReconciliationReason =
  | "agreed"
  | "only-authored-resolved"
  | "only-selected-resolved"
  | "selected-closed-instantiation"
  | "authored-proven-source-alias";

export type SourceEvidenceReconciliation =
  | {
      readonly kind: "resolved";
      readonly targetType: TargetTypeRef;
      readonly reason: SourceEvidenceReconciliationReason;
    }
  | { readonly kind: "unresolved" }
  | {
      readonly kind: "conflict";
      readonly authored: TargetTypeRef;
      readonly selected: TargetTypeRef;
    };

/**
 * Reconciles the target type derived from authored source syntax against the
 * target type derived from the checker's selected instantiation.
 *
 * Neither side is privileged by lookup order. The two carry different
 * authority depending on their role:
 *
 * - `identity<T>(value: T)` selected as `identity<string>` has an authored
 *   parameter type of the open `T` and a selected type of `string`. The closed
 *   instantiation is the answer; the open authored type must not replace it.
 * - `consume(value: int32)` has an authored type node carrying finalized
 *   source-primitive facts while the semantic type is the erased `number`
 *   carrier. The proven source alias is the answer.
 *
 * Both sides resolving to different closed target types is contradictory
 * evidence, never a precedence question; callers fail closed on it.
 */
export function reconcileAuthoredAndSelectedTargetType(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
): SourceEvidenceReconciliation {
  if (authored === undefined && selected === undefined) {
    return { kind: "unresolved" };
  }
  if (selected === undefined) {
    return { kind: "resolved", targetType: authored!, reason: "only-authored-resolved" };
  }
  if (authored === undefined) {
    return { kind: "resolved", targetType: selected, reason: "only-selected-resolved" };
  }
  if (targetTypeRefEquals(authored, selected)) {
    return { kind: "resolved", targetType: authored, reason: "agreed" };
  }
  if (!targetTypeRefIsClosed(authored) && targetTypeRefIsClosed(selected)) {
    return { kind: "resolved", targetType: selected, reason: "selected-closed-instantiation" };
  }
  if (authored.kind === "source-primitive" && selected.kind !== "source-primitive") {
    return { kind: "resolved", targetType: authored, reason: "authored-proven-source-alias" };
  }
  if (targetTypeRefIsClosed(authored) && !targetTypeRefIsClosed(selected)) {
    return { kind: "resolved", targetType: authored, reason: "only-authored-resolved" };
  }
  return { kind: "conflict", authored, selected };
}
