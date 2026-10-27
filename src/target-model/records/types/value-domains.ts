import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpValueDomainCarrierQueries {
  readonly carrierFor: (node: Node) => TargetTypeRef | undefined;
}

export interface CsharpValueDomainCarrierIssue {
  readonly node: Node;
  readonly code: "CSHARP_VALUE_DOMAIN_METADATA_BUDGET_EXHAUSTED";
  readonly message: string;
}

export interface CsharpValueDomainCarrierAnalysis extends CsharpValueDomainCarrierQueries {
  readonly issues: readonly CsharpValueDomainCarrierIssue[];
}
