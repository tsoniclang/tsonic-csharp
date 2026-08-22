import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpExpectedTypeIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpExpectedTypeClassifications {
  readonly issues: readonly CsharpExpectedTypeIssue[];
  readonly targetTypes: readonly TargetTypeRef[];
  forExpression(expression: Node): readonly TargetTypeRef[];
  storageTypesForExpression(expression: Node): readonly TargetTypeRef[];
  callableTarget(expression: Node): TargetTypeRef | undefined;
  binaryExpected(
    expression: Node,
    targetType: TargetTypeRef,
  ): import("../../policy/operations/index.js").CsharpOperationSelection<
    import("../../policy/operations/index.js").CsharpResolvedBinaryOperation
  > | undefined;
}
