import type { TargetTypeRef } from "../types/model.js";
import type { CsharpRawLocationSelection } from "./native-memory.js";
import type { CsharpRawAddressSelection, CsharpSourceRawAddressOperation } from "./raw-addresses.js";
import type { Node } from "@tsonic/tsts";

export type CsharpNativePointerOperationSelection =
  | { readonly kind: "not-native-pointer" }
  | {
      readonly kind: "rejected";
      readonly operation: CsharpNativePointerOperationKind;
      readonly reason: string;
    }
  | CsharpResolvedNativePointerOperation;

export type CsharpNativePointerOperationKind = "load" | "store" | "offset" | "equal-raw-pointer" | "hash-raw-pointer" | "layout-query" | "raw-location" | CsharpSourceRawAddressOperation["operation"];

export type CsharpResolvedNativePointerOperation =
  | Extract<CsharpRawLocationSelection, { readonly kind: "raw-location" }>
  | { readonly kind: "layout-query"; readonly value: number }
  | Extract<CsharpRawAddressSelection, { readonly kind: "raw-address" }>
  | {
      readonly kind: "raw-identity";
      readonly method: "Same" | "Hash";
      readonly arguments: readonly Node[];
      readonly carrier: TargetTypeRef;
      readonly parameterType: TargetTypeRef;
    }
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "load";
    }
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "store";
      readonly valueExpression: Node;
    }
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "offset";
      readonly offsetExpression: Node;
      readonly offsetType: TargetTypeRef;
    };

export interface CsharpResolvedNativePointerOperationBase {
  readonly call: Node;
  readonly pointerExpression: Node;
  readonly pointerType: Extract<TargetTypeRef, { readonly kind: "pointer" }>;
  readonly pointeeType: TargetTypeRef;
}
