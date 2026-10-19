import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpBorrowedSequenceInput {
  readonly expression: Node;
  readonly array: Node;
  readonly sourceCarrier: TargetTypeRef;
  readonly controlNodes: readonly Node[];
  readonly inputs: readonly (
    | { readonly kind: "empty"; readonly expression: Node }
    | { readonly kind: "sequence"; readonly expression: Node; readonly carrier: TargetTypeRef;
        readonly presentCarrier: TargetTypeRef; readonly optional: boolean; readonly lengthMember: string | undefined;
        readonly elements: readonly TargetTypeRef[] }
  )[];
}
