import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export type CsharpReturnTargetContract =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpDeclarationClassifications {
  returnContract(node: Node): CsharpReturnTargetContract | undefined;
}
