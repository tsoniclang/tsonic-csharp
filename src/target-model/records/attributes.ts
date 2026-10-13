import type { Node } from "@tsonic/tsts";

export interface CsharpAttributeApplication {
  readonly invocation: Node;
  readonly targetSpecifier?: "field" | "property" | "param" | "return";
}

export interface CsharpAttributeApplicationIndex {
  readonly attributeApplication: { get(declaration: Node): readonly CsharpAttributeApplication[] };
  readonly erasedAttribute: { get(subject: Node): boolean };
}
