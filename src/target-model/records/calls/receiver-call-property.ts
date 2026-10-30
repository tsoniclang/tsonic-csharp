import type { Node } from "@tsonic/tsts";
import type { CsharpTargetPropertySelection } from "../operations/member-selections.js";

export interface CsharpReceiverCallPropertyEmission {
  readonly selection: Extract<CsharpTargetPropertySelection, { readonly kind: "resolved" }>;
}
export interface CsharpReceiverCallPropertyRecords {
  readonly receiverCallProperty: { readonly get: (node: Node) => CsharpReceiverCallPropertyEmission | undefined };
}
