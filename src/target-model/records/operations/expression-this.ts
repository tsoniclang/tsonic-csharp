import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpThisEmission {
  readonly kind: "captured" | "bound" | "instance";
  readonly carrier: TargetTypeRef;
}

export interface CsharpThisEmissionRecords {
  readonly thisEmission: { readonly get: (node: Node) => CsharpThisEmission | undefined };
}
