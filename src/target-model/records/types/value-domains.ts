import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpValueDomainCarrierQueries {
  readonly carrierFor: (node: Node) => TargetTypeRef | undefined;
}

export interface CsharpValueDomainCarrierIssue {
  readonly node: Node;
  readonly code: "TSONIC_COMPILER_RESOURCE_LIMIT";
  readonly message: string;
}

export interface CsharpValueDomainCarrierAnalysis extends CsharpValueDomainCarrierQueries {
  readonly issues: readonly CsharpValueDomainCarrierIssue[];
}
