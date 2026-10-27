import type { Node } from "@tsonic/tsts";
import type { CsharpCallClassification, CsharpCallForm } from "../operations/operations.js";
import type { CsharpTargetCallSelection } from "../operations/member-selections.js";
import type { CsharpJsValueOperationSelection } from "../../operations/js-values.js";

export type CsharpAdmittedCallClassification = Omit<CsharpCallClassification, "form" | "target"> & (
  | { readonly form: Extract<CsharpCallForm, { readonly kind: "type-test" | "keep-alive" }>; readonly target?: never }
  | { readonly form: { readonly kind: "js-value"; readonly optionalReceiverRouting: "call" | "chain";
      readonly operation: Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }> }; readonly target?: never }
  | { readonly form: Extract<CsharpCallForm, { readonly kind: "target" }>;
      readonly target: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" | "source-owned" }> }
);

export interface CsharpCallAdmissionRecords {
  readonly selectedCall: { readonly get: (node: Node) => CsharpAdmittedCallClassification | undefined };
}
