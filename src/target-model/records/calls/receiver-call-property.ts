import type { Node } from "@tsonic/tsts";
import type { CsharpTargetPropertySelection } from "../operations/member-selections.js";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpReceiverCallPropertyEmission {
  readonly selection: Extract<CsharpTargetPropertySelection, { readonly kind: "resolved" }>;
  readonly owner: TargetTypeRef;
}
export interface CsharpReceiverCallPropertyRecords {
  readonly receiverCallProperty: { readonly get: (node: Node) => CsharpReceiverCallPropertyEmission | undefined };
}
