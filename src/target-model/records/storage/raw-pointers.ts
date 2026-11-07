import type { Node } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";

export interface CsharpSourceRawPointerIdentity {
  readonly call: Node;
  readonly operation: "equal-raw-pointer" | "hash-raw-pointer";
  readonly arguments: readonly { readonly expression: Node; readonly type: SourceTypeDescriptor }[];
}
