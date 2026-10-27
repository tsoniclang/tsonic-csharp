import type { Node } from "@tsonic/tsts";
import type { CsharpPropertyClassification } from "../operations/operations.js";
import type { CsharpTargetPropertySelection } from "../operations/member-selections.js";
import type { CsharpJsValueOperationSelection } from "../../operations/js-values.js";
import type { TargetTypeRef } from "../../types/model.js";

export type CsharpAdmittedPropertyClassification = Omit<CsharpPropertyClassification, "selection"> & {
  readonly selection: Extract<CsharpTargetPropertySelection, { readonly kind: "resolved" | "source-owned" | "union-property" }>;
};

export interface CsharpUnionPropertyProjection {
  readonly unionCarrier: TargetTypeRef;
  readonly variants: readonly { readonly index: number; readonly carrier: TargetTypeRef; readonly memberName: string }[];
  readonly resultCarrier: TargetTypeRef;
}

export type CsharpSourceMemberEmission =
  | { readonly kind: "union"; readonly flow: true }
  | { readonly kind: "js-value"; readonly flow: boolean; readonly name: string;
      readonly operation: Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }> }
  | { readonly kind: "member"; readonly flow: boolean; readonly methodValue: boolean; readonly static: boolean };

export interface CsharpPropertyAdmissionRecords {
  readonly selectedProperty: { readonly get: (node: Node) => CsharpAdmittedPropertyClassification | undefined };
  readonly sourceMemberEmission: { readonly get: (node: Node) => CsharpSourceMemberEmission | undefined };
  readonly unionPropertyProjection: { readonly get: (node: Node) => CsharpUnionPropertyProjection | undefined };
  readonly sourceNameIndexer: { readonly get: (node: Node) => string | undefined };
}
