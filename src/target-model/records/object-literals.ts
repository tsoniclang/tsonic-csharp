import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpJsValueOperationSelection } from "../operations/js-values.js";

export type CsharpObjectLiteralMemberEmission =
  | { readonly kind: "value"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact; readonly initializer: Node }
  | { readonly kind: "method" | "authored" | "accessor"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact }
  | { readonly kind: "spread"; readonly property: Node; readonly expression: Node;
      readonly presence: { readonly kind: "required" } | { readonly kind: "optional"; readonly carrier: TargetTypeRef };
      readonly fields: readonly { readonly source: string; readonly target: string; readonly carrier: TargetTypeRef }[] };

export type CsharpObjectLiteralEmission = {
  readonly members: readonly CsharpObjectLiteralMemberEmission[];
} & (
  | { readonly kind: "native" }
  | { readonly kind: "js"; readonly keyCarrier: TargetTypeRef; readonly operation: Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }> }
);

export interface CsharpObjectLiteralRecords {
  readonly objectLiteral: { readonly get: (shape: CsharpObjectShapeFact, node: Node) => CsharpObjectLiteralEmission | undefined };
  readonly objectLiteralMember: { readonly get: (shape: CsharpObjectShapeFact, node: Node) => CsharpObjectLiteralMemberEmission | undefined };
}
