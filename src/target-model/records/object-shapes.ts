import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeRecords {
  readonly nodeObjectShape: { readonly get: (node: Node | undefined, sourceFile?: SourceFile) => CsharpObjectShapeFact | undefined };
  readonly targetObjectShape: { readonly get: (carrier: TargetTypeRef | undefined) => CsharpObjectShapeFact | undefined };
}
