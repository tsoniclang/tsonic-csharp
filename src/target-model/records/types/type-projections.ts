import type { CsharpProjectedType } from "../../types/projections.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpPublishedCallableProjections {
  readonly kind: "source";
  readonly source: { readonly declaration: Node };
  readonly declaration: Node;
  readonly index: CsharpGenericProjectionIndex;
  readonly projections: readonly CsharpProjectedType[];
}

export type CsharpCallableProjectionReceipt = CsharpPublishedCallableProjections |
  { readonly kind: "declaration"; readonly declaration: Node };

export interface CsharpGenericProjectionIndex {
  readonly entries: readonly {
    readonly declaration: Node;
    readonly parameters: readonly CsharpProjectedType[];
    readonly outerParameters: readonly CsharpProjectedType[];
  }[];
  readonly genericProjection: { readonly get: (declaration: Node) => readonly CsharpProjectedType[] };
  readonly outerGenericProjection: { readonly get: (declaration: Node) => readonly CsharpProjectedType[] };
}
