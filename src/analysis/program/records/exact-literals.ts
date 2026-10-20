import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExactLiteralRole, CsharpExactLiteralSelection, CsharpExactLiteralSelectionIndex } from "../../../target-model/conversions/exact-literals.js";

const notALiteral: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });

export function createCsharpExactLiteralProducer() {
  const selections = new WeakMap<Node, Map<string, CsharpExactLiteralSelection>>();
  const nonLiterals = new WeakSet<Node>();
  let closed = false;
  return Object.freeze({
    nonLiteral(node: Node): void {
      assertOpen(node);
      nonLiterals.add(node);
    },
    has(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole): boolean {
      return selections.get(node)?.has(requestKey(target, role)) === true;
    },
    select(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole, value: CsharpExactLiteralSelection): void {
      assertOpen(node);
      const key = requestKey(target, role);
      const byTarget = selections.get(node) ?? new Map<string, CsharpExactLiteralSelection>();
      if (byTarget.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "An exact literal endpoint publishes once.", node);
      byTarget.set(key, Object.freeze(value));
      selections.set(node, byTarget);
    },
    seal(): CsharpExactLiteralSelectionIndex {
      assertOpen();
      closed = true;
      return Object.freeze({ exactLiteral: Object.freeze({
        get: (node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole = "value") => {
          const selected = selections.get(node)?.get(requestKey(target, role));
          return selected === undefined && role === "value" && nonLiterals.has(node) ? notALiteral : selected;
        },
      }) });
    },
  });
  function assertOpen(node?: Node): void {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Exact literal publication is closed.", node);
  }
}

function requestKey(target: TargetTypeRef | undefined, role: CsharpExactLiteralRole): string {
  return role + ":" + (target === undefined ? "" : targetTypeRefKey(target));
}
