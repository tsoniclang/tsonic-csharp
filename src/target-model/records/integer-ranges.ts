import type { Node } from "@tsonic/tsts";

export interface CsharpIntegerRangeIndex {
  readonly get: (expression: Node) => boolean;
}
