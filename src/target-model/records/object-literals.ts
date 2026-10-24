import type { Node } from "@tsonic/tsts";
import type { CsharpDelegateSignatureShape, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";

export type CsharpObjectLiteralMemberEmission =
  | { readonly kind: "value"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact; readonly initializer: Node }
  | { readonly kind: "authored"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact }
  | { readonly kind: "method" | "accessor"; readonly property: Node; readonly member: CsharpObjectShapeMemberFact; readonly callable: CsharpObjectLiteralCallableEmission }
  | { readonly kind: "spread"; readonly property: Node; readonly expression: Node;
      readonly presence: { readonly kind: "required" } | { readonly kind: "optional"; readonly carrier: TargetTypeRef };
      readonly fields: readonly { readonly source: string; readonly target: string; readonly carrier: TargetTypeRef }[] };

export type CsharpObjectLiteralEmission = {
  readonly kind: "native";
  readonly members: readonly CsharpObjectLiteralMemberEmission[];
  readonly initialization: CsharpObjectInitialization;
};

export interface CsharpObjectInitialization {
  readonly inlineUnique: boolean;
  readonly slots: readonly { readonly name: string; readonly carrier: TargetTypeRef; readonly initializeAbsence: boolean }[];
  /**
   * Required data members of the constructed shape that the literal does not author (an Object.assign target built at
   * the merged result shape); they start at their storage default and the selected call writes them.
   */
  readonly deferred: readonly { readonly name: string; readonly carrier: TargetTypeRef }[];
}

export interface CsharpObjectLiteralRecords {
  readonly objectLiteral: { readonly get: (shape: CsharpObjectShapeFact, node: Node) => CsharpObjectLiteralEmission | undefined };
  readonly objectLiteralMember: { readonly get: (shape: CsharpObjectShapeFact, node: Node) => CsharpObjectLiteralMemberEmission | undefined };
  /** Every object-literal method or accessor whose body receives the object as its receiver, with that receiver carrier. */
  readonly receiverBoundCallables: readonly { readonly property: Node; readonly receiver: TargetTypeRef }[];
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
