import type { Node } from "@tsonic/tsts";
import type { CsharpBindingIdentity, CsharpBindingIdentityRecords } from "../../../../target-model/records/storage/binding-identities.js";

export function createCsharpBindingIdentityRecords(values: ReadonlyMap<Node, CsharpBindingIdentity>): CsharpBindingIdentityRecords {
  return Object.freeze({ bindingIdentity: Object.freeze({ get: (subject: Node) => values.get(subject) }) });
}
