import type { Node } from "@tsonic/tsts";
import type { CsharpDelegateSignatureShape, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpJsValueOperationSelection } from "../operations/js-values.js";

export type CsharpObjectLiteralMemberEmission =
  | { readonly kind: "value"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact; readonly initializer: Node }
  | { readonly kind: "authored"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact }
  | { readonly kind: "method" | "accessor"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact; readonly callable: CsharpObjectLiteralCallableEmission }
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

export interface CsharpObjectLiteralCallableEmission {
  readonly body: Node;
  readonly parameters: readonly Node[];
  readonly carrier: TargetTypeRef;
  readonly storage: TargetTypeRef;
  readonly signature: CsharpDelegateSignatureShape;
  readonly receiver: TargetTypeRef | undefined;
  readonly async: boolean;
  readonly storageName: string;
}
