import type { Node } from "@tsonic/tsts";

export interface CsharpNumericRepresentations {
  readonly int32Remainder: { readonly get: (expression: Node) => boolean };
}
