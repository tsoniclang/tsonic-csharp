import type { Node } from "@tsonic/tsts";
import type { CsharpElementClassification, CsharpMemberReceiverProjection } from "../operations/operations.js";
import type { CsharpTargetElementSelection } from "../operations/member-selections.js";
import type { CsharpJsValueOperationSelection, CsharpJsValueInvocation } from "../../operations/js-values.js";
import type { TargetTypeRef } from "../../types/model.js";

type ElementSource = Extract<CsharpTargetElementSelection, { readonly kind: "resolved" }>["source"];
export interface CsharpElementOperands {
  readonly receiver: ElementSource["receiver"];
  readonly key: Node;
  readonly result: TargetTypeRef;
  readonly optional: boolean;
  readonly projection: CsharpMemberReceiverProjection | undefined;
}
export type CsharpElementRead =
  | { readonly kind: "index" | "record-optional" }
  | { readonly kind: "collection"; readonly carrier: TargetTypeRef }
  | { readonly kind: "method"; readonly name: string; readonly append: number | undefined }
  | { readonly kind: "array-like"; readonly owner: TargetTypeRef; readonly name: string; readonly projection: CsharpMemberReceiverProjection };
export type CsharpElementEmission =
  | { readonly kind: "js-value"; readonly receiver: Node; readonly key: Node; readonly optional: boolean; readonly result: TargetTypeRef;
      readonly operation: CsharpJsValueInvocation }
  | (CsharpElementOperands & { readonly kind: "access"; readonly read: CsharpElementRead; readonly indexType: TargetTypeRef | undefined;
      readonly conversion: CsharpMemberReceiverProjection | undefined })
  | (CsharpElementOperands & { readonly kind: "tuple"; readonly member: string })
  | (CsharpElementOperands & { readonly kind: "source-member"; readonly static: boolean; readonly present: TargetTypeRef; readonly suspends: boolean; readonly writable: boolean });

export type CsharpAdmittedElementClassification = Omit<CsharpElementClassification, "target" | "jsValue"> & {
  readonly target?: Extract<CsharpTargetElementSelection, { readonly kind: "resolved" | "source-owned" | "project-indexer" }>;
  readonly jsValue: Exclude<CsharpJsValueOperationSelection, { readonly kind: "rejected" }>;
  readonly emission: CsharpElementEmission;
};
export interface CsharpElementAdmissionRecords {
  readonly selectedElement: { readonly get: (node: Node) => CsharpAdmittedElementClassification | undefined };
}
