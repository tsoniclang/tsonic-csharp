import type { Node, Symbol } from "@tsonic/tsts";

export type CsharpBindingIdentity = Node | Symbol;

export interface CsharpBindingIdentityRecords {
  readonly bindingIdentity: { readonly get: (subject: Node) => CsharpBindingIdentity | undefined };
}
