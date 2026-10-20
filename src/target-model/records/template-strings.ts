import type { Node } from "@tsonic/tsts";

export interface CsharpTemplateStringEmission {
  readonly head: string;
  readonly parts: readonly { readonly expression: Node; readonly literal: string }[];
}

export interface CsharpTemplateStringRecords {
  readonly templateString: { readonly get: (node: Node) => CsharpTemplateStringEmission | undefined };
}
