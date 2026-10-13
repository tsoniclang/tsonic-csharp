import type { CsharpProjectedType } from "../types/projections.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpGenericProjectionIndex {
  readonly entries: readonly {
    readonly declaration: Node;
    readonly parameters: readonly CsharpProjectedType[];
    readonly outerParameters: readonly CsharpProjectedType[];
  }[];
  readonly genericProjection: { get(declaration: Node): readonly CsharpProjectedType[] };
  readonly outerGenericProjection: { get(declaration: Node): readonly CsharpProjectedType[] };
}
