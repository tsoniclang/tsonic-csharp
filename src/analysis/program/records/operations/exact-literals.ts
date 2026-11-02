import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExactLiteralRole, CsharpExactLiteralSelection, CsharpExactLiteralSelectionIndex } from "../../../../target-model/conversions/exact-literals.js";

const notALiteral: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });

interface CsharpExactLiteralEndpoint {
  readonly source: TargetTypeRef | undefined;
  readonly selection: CsharpExactLiteralSelection;
}

export function createCsharpExactLiteralProducer() {
  const selections = new WeakMap<Node, Map<string, CsharpExactLiteralEndpoint>>();
  const nonLiterals = new WeakSet<Node>();
  let closed = false;
  return Object.freeze({
    nonLiteral(node: Node): void {
      assertOpen(node);
      nonLiterals.add(node);
    },
    has(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole, source: TargetTypeRef | undefined): boolean {
      const selected = selections.get(node)?.get(requestKey(target, role));
      assertSource(node, selected?.source, source, selected !== undefined);
      return selected !== undefined;
    },
    select(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole, source: TargetTypeRef | undefined,
      value: CsharpExactLiteralSelection): void {
      const key = requestKey(target, role);
      const byTarget = selections.get(node) ?? new Map<string, CsharpExactLiteralEndpoint>();
      const previous = byTarget.get(key);
      assertSource(node, previous?.source, source, previous !== undefined);
      assertOpen(node);
      if (byTarget.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "An exact literal endpoint publishes once.", node);
      byTarget.set(key, Object.freeze({ source, selection: Object.freeze(value) }));
      selections.set(node, byTarget);
    },
    seal(): CsharpExactLiteralSelectionIndex {
      assertOpen();
      closed = true;
      return Object.freeze({ exactLiteral: Object.freeze({
        get: (node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole = "value") => {
          const selected = selections.get(node)?.get(requestKey(target, role))?.selection;
          return selected === undefined && role === "value" && nonLiterals.has(node) ? notALiteral : selected;
        },
      }) });
    },
  });
  function assertOpen(node?: Node): void {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Exact literal publication is closed.", node);
  }

  function assertSource(node: Node, previous: TargetTypeRef | undefined, source: TargetTypeRef | undefined, published: boolean): void {
    if (published && source !== undefined && (previous === undefined || !targetTypeRefEquals(previous, source)))
      failTargetAnalysisInvariant("tsonic-csharp", "An exact literal endpoint requires one completed native source carrier.", node);
  }
}

function requestKey(target: TargetTypeRef | undefined, role: CsharpExactLiteralRole): string {
  return role + ":" + (target === undefined ? "" : targetTypeRefKey(target));
}
