import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";

export interface CsharpObjectShapeRecords {
  readonly nodeObjectShape: { readonly get: (node: Node | undefined, sourceFile?: SourceFile) => CsharpObjectShapeFact | undefined };
  readonly targetObjectShape: { readonly get: (carrier: TargetTypeRef | undefined) => CsharpObjectShapeFact | undefined };
}
