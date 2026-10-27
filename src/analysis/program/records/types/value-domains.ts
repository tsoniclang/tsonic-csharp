import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpValueDomainCarrierAnalysis, CsharpValueDomainCarrierIssue } from "../../../../target-model/records/types/value-domains.js";

export function createCsharpValueDomainCarrierRecords(
  entries: ReadonlyMap<Node, TargetTypeRef>, issues: readonly CsharpValueDomainCarrierIssue[], complete: boolean,
): CsharpValueDomainCarrierAnalysis {
  const carriers = new WeakMap(entries);
  return Object.freeze({ issues: Object.freeze([...issues]), carrierFor: (node: Node) => complete ? carriers.get(node) : undefined });
}
