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
  readonly expectedType: { get(expression: Node): readonly TargetTypeRef[] };
  readonly requiredExpectedType: { get(expression: Node): readonly TargetTypeRef[] };
  readonly exactIntegerConversion: { get(expression: Node, targetType: TargetTypeRef): boolean };
  readonly storageExpectedType: { get(expression: Node): readonly TargetTypeRef[] };
  readonly callableTarget: { get(expression: Node): TargetTypeRef | undefined };
  readonly arrayLiteralCarrier: { get(expression: Node, targetType: TargetTypeRef): TargetTypeRef | undefined };
  readonly expectedBinary: { get(expression: Node, targetType: TargetTypeRef): import("./operator-selection.js").CsharpOperationSelection<
    import("./operator-selection.js").CsharpResolvedBinaryOperation
  > | undefined };
}
