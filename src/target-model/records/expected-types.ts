import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpExpectedTypeIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpExpectedTypeClassifications {
  readonly issues: readonly CsharpExpectedTypeIssue[];
  readonly targetTypes: readonly TargetTypeRef[];
  readonly expectedType: { readonly get: (expression: Node) => readonly TargetTypeRef[] };
  readonly requiredExpectedType: { readonly get: (expression: Node) => readonly TargetTypeRef[] };
  readonly exactIntegerConversion: { readonly get: (expression: Node, targetType: TargetTypeRef) => boolean };
  readonly storageExpectedType: { readonly get: (expression: Node) => readonly TargetTypeRef[] };
  readonly callableTarget: { readonly get: (expression: Node) => TargetTypeRef | undefined };
  readonly arrayLiteralCarrier: { readonly get: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined };
  readonly expectedBinary: { readonly get: (expression: Node, targetType: TargetTypeRef) => import("./operator-selection.js").CsharpOperationSelection<
    import("./operator-selection.js").CsharpResolvedBinaryOperation
  > | undefined };
}
