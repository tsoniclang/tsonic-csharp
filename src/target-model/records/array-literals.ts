import { type Node } from "@tsonic/tsts";
import { type TargetTypeRef } from "../types/model.js";
import { type CsharpConversionSelection } from "../conversions/selection.js";
import { type CsharpBorrowedSequenceInput } from "./borrowed-sequences.js";
import { type TargetTypeRef } from "../../policy/types/types/model.js";

export interface CsharpArraySpreadEmission {
  readonly carrier: TargetTypeRef;
  readonly elements: readonly { readonly carrier: TargetTypeRef; readonly conversion: CsharpConversionSelection }[];
  readonly lengthMember: string | undefined;
  readonly nativeSpread: boolean;
  readonly sequence: CsharpSequenceEmission;
}

export interface CsharpSequenceEmission {
  readonly iteration: "tuple" | "indexed" | "enumerable";
  readonly tupleMembers: readonly string[];
  readonly bulkCopy: boolean;
  readonly appendSequence: boolean;
  readonly resultCarrier: TargetTypeRef;
}

export interface CsharpArrayLiteralEmission {
  readonly kind: "array" | "tuple" | "collection" | "js";
  readonly carrier: TargetTypeRef;
  readonly element: TargetTypeRef | undefined;
  readonly construction: { readonly carrier: TargetTypeRef;
    readonly builder: { readonly capacityConstructor: boolean; readonly appendElementMethod: string } } | undefined;
  readonly omitted: readonly TargetTypeRef[];
  readonly contributions: readonly { readonly node: Node; readonly expression: Node; readonly spread: boolean; readonly snapshot: boolean }[];
  readonly nativeSpread: boolean;
}

export interface CsharpBorrowedSequenceEmission {
  readonly inputs: readonly ({ readonly kind: "empty" } | { readonly kind: "sequence";
    readonly expression: Node; readonly carrier: TargetTypeRef; readonly presentCarrier: TargetTypeRef;
    readonly optional: boolean; readonly spread: CsharpArraySpreadEmission })[];
}

export interface CsharpArrayLiteralRecords {
  readonly arrayLiteral: { readonly get: (node: Node, carrier: TargetTypeRef) => CsharpArrayLiteralEmission | undefined };
  readonly arraySpread: { readonly get: (node: Node, target: TargetTypeRef) => CsharpArraySpreadEmission | undefined };
  readonly borrowedSequenceEmission: { readonly get: (input: CsharpBorrowedSequenceInput, target: TargetTypeRef) => CsharpBorrowedSequenceEmission | undefined };
}


export type CsharpArrayLiteralSelection =
  | { readonly kind: "resolved"; readonly carrier: TargetTypeRef; readonly elementCarriers: readonly TargetTypeRef[] }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "unavailable" };
