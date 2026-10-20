import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";

export interface CsharpNativeConstantRecords {
  readonly nativeConstant: { readonly get: (node: Node, carrier: TargetTypeRef) => boolean | undefined };
  readonly nativeAbsence: { readonly get: (node: Node, carrier: TargetTypeRef) => boolean | undefined };
}
