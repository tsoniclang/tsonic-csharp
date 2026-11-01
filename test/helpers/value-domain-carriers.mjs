import { targetTypeRefEquals } from "../../dist/target-model/types/equality.js";

export function selectedValueDomainHasTargetType(host, node, expected) {
  const carrier = host.valueDomainCarriers?.carrierFor(node);
  return carrier !== undefined && targetTypeRefEquals(carrier, expected);
}
