import type { Node } from "@tsonic/tsts";

export interface CsharpNumericRepresentations {
  readonly int32Remainder: { get(expression: Node): boolean };
}
