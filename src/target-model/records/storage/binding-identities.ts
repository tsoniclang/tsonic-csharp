import type { Node } from "@tsonic/tsts";

/** A binding is identified by its declaration Node (roles are keyed by declaration, never by checker Symbol). */
export type CsharpBindingIdentity = Node;

export interface CsharpBindingIdentityRecords {
  readonly bindingIdentity: { readonly get: (subject: Node) => CsharpBindingIdentity | undefined };
}
