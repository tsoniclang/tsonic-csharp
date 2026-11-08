import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export type CsharpIndexedRecordRead =
  | { readonly kind: "direct" }
  | { readonly kind: "optional"; readonly owner: TargetTypeRef; readonly result: TargetTypeRef };

export interface CsharpIndexedRecordRecords {
  readonly indexedRecordRead: { readonly get: (subject: Node) => CsharpIndexedRecordRead | undefined };
}
