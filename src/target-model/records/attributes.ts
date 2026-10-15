import type { Node } from "@tsonic/tsts";

export interface CsharpAttributeApplication {
  readonly invocation: Node;
  readonly targetSpecifier?: "field" | "property" | "param" | "return";
}

export interface CsharpAttributeApplicationIndex {
  readonly attributeApplication: { readonly get: (declaration: Node) => readonly CsharpAttributeApplication[] };
  readonly erasedAttribute: { readonly get: (subject: Node) => boolean };
}
