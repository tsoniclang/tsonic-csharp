import type { Node } from "@tsonic/tsts";

export interface CsharpAttributeApplication {
  readonly invocation: Node;
  readonly targetSpecifier?: "field" | "property" | "param" | "return";
}

export interface CsharpAttributeApplicationIndex {
  forDeclaration(declaration: Node): readonly CsharpAttributeApplication[];
  isErasedSubject(subject: Node): boolean;
}
