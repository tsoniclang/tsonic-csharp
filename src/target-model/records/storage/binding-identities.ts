import type { Node } from "@tsonic/tsts";

export type CsharpBindingIdentity = Node;

export interface CsharpBindingIdentityRecords {
  readonly bindingIdentity: { readonly get: (subject: Node) => CsharpBindingIdentity | undefined };
}
