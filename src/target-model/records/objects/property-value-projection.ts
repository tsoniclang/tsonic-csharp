import type { Node } from "@tsonic/tsts";
import type { CsharpUnionPathStep, TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpClosedShapeMemberProjection } from "./closed-object-shapes.js";

export type CsharpPropertyValueProjectionEmission =
  | { readonly kind: "identity" }
  | { readonly kind: "absence" }
  | { readonly kind: "boxed" }
  | { readonly kind: "optional"; readonly present: TargetTypeRef }
  | { readonly kind: "union"; readonly leaves: readonly { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] }
  | { readonly kind: "object"; readonly members: readonly CsharpClosedShapeMemberProjection[];
      readonly literal: readonly { readonly initializer: Node;
        readonly projection: Extract<CsharpClosedShapeMemberProjection, { readonly native?: never }> }[] | undefined };

export interface CsharpPropertyValueProjectionRecords {
  readonly propertyValueProjection: { readonly get: (node: Node, source: TargetTypeRef) => CsharpPropertyValueProjectionEmission | undefined };
}
