import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralRole, CsharpExactLiteralSelection, CsharpExactLiteralSelectionIndex } from "../../../../target-model/conversions/exact-literals.js";

const notALiteral: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });

interface CsharpExactLiteralRecord {
  request: CsharpExactLiteralRequest;
  selection: CsharpExactLiteralSelection | undefined;
}

export function createCsharpExactLiteralProducer() {
  const selections = new Map<Node, Map<string, CsharpExactLiteralRecord>>();
  const nonLiterals = new WeakSet<Node>();
  let closed = false;
  return Object.freeze({
    nonLiteral(node: Node): void {
      assertOpen(node);
      nonLiterals.add(node);
    },
    request(request: CsharpExactLiteralRequest): void {
      assertOpen(request.expression);
      const role = request.propertyKey === undefined ? "value" : "property-key";
      const key = requestKey(request.target, role);
      const byTarget = selections.get(request.expression) ?? new Map<string, CsharpExactLiteralRecord>();
      const existing = byTarget.get(key);
      if (existing !== undefined) {
        const previous = existing.request;
        if (previous.propertyKey === undefined && request.propertyKey === undefined) {
          assertSource(previous.source, request.source, request.expression);
          if (previous.source === undefined && request.source !== undefined) {
            if (existing.selection !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
              "An exact literal source closes before selection.", request.expression);
            existing.request = Object.freeze({ ...previous, source: request.source });
          }
        }
        return;
      }
      byTarget.set(key, { request: Object.freeze({ ...request }), selection: undefined });
      selections.set(request.expression, byTarget);
    },
    *requests(): Iterable<CsharpExactLiteralRequest> {
      for (const byTarget of selections.values()) {
        for (const entry of byTarget.values()) yield entry.request;
      }
    },
    has(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole, source: TargetTypeRef | undefined): boolean {
      const entry = selections.get(node)?.get(requestKey(target, role));
      if (entry?.request.propertyKey === undefined) assertSource(entry?.request.source, source, node);
      return entry?.selection !== undefined;
    },
    select(node: Node, target: TargetTypeRef | undefined, role: CsharpExactLiteralRole, source: TargetTypeRef | undefined,
      value: CsharpExactLiteralSelection): void {
      assertOpen(node);
      const key = requestKey(target, role);
      const entry = selections.get(node)?.get(key);
      if (entry === undefined || entry.selection !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "An exact literal endpoint publishes once after source completion.", node);
      if (entry.request.propertyKey === undefined) assertSource(entry.request.source, source, node);
      entry.selection = Object.freeze(value);
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
  function assertSource(previous: TargetTypeRef | undefined, source: TargetTypeRef | undefined, node: Node): void {
    if (previous !== undefined && source !== undefined && !targetTypeRefEquals(previous, source)) {
      failTargetAnalysisInvariant("tsonic-csharp", "An exact literal endpoint requires one completed native source carrier.", node);
    }
  }
}

function requestKey(target: TargetTypeRef | undefined, role: CsharpExactLiteralRole): string {
  return role + ":" + (target === undefined ? "" : targetTypeRefKey(target));
}
