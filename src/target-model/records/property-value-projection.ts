import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpClosedShapeMemberProjection } from "./closed-object-shapes.js";
import type { CsharpUnionPathStep } from "../types/union-relations.js";

export type CsharpPropertyValueProjectionEmission =
  | { readonly kind: "identity" }
  | { readonly kind: "absence" }
  | { readonly kind: "boxed" }
  | { readonly kind: "optional"; readonly present: TargetTypeRef }
  | { readonly kind: "union"; readonly leaves: readonly { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] }
  | { readonly kind: "object"; readonly members: readonly CsharpClosedShapeMemberProjection[] };

export interface CsharpPropertyValueProjectionRecords {
  readonly propertyValueProjection: { readonly get: (node: Node, source: TargetTypeRef) => CsharpPropertyValueProjectionEmission | undefined };
}
