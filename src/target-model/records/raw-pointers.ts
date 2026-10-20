import type { Node, Type } from "@tsonic/tsts";

export interface CsharpSourceRawPointerIdentity {
  readonly call: Node;
  readonly operation: "equal-raw-pointer" | "hash-raw-pointer";
  readonly arguments: readonly { readonly expression: Node; readonly type: Type }[];
}
