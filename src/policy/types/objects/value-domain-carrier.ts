import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export interface CsharpValueDomainCarrierQueries {
  readonly carrierFor: (node: Node) => TargetTypeRef | undefined;
}

export interface CsharpValueDomainCarrierHost {
  readonly valueDomainCarriers?: CsharpValueDomainCarrierQueries;
}

export function csharpValueDomainHasTargetType(
  host: CsharpValueDomainCarrierHost,
  node: Node,
  expected: TargetTypeRef,
): boolean {
  const carrier = host.valueDomainCarriers?.carrierFor(node);
  return carrier !== undefined && targetTypeRefEquals(carrier, expected);
}
