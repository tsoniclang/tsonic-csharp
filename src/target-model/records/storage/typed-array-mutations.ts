import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpResolvedBinaryOperation } from "../operations/operator-selection.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpTypedArrayMutation {
  readonly kind: "set-typed-element";
  readonly receiver: Node;
  readonly index: Node;
  readonly value: Node;
  readonly resultType: TargetTypeRef;
  readonly calculation?: CsharpResolvedBinaryOperation;
}

export interface CsharpTypedArrayUpdate {
  readonly kind: "update-typed-element";
  readonly receiver: Node;
  readonly index: Node;
  readonly indexType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly increment: boolean;
  readonly prefix: boolean;
}
