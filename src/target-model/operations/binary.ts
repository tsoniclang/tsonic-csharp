import type { TargetTypeRef } from "../types/model.js";
import type { CsharpUnionPathStep } from "../types/union-relations.js";
import { csharpUnionArmMappingsEqual } from "../types/union-relations.js";
import { targetTypeRefEquals } from "../types/equality.js";

export interface CsharpReferenceEquality {
  readonly kind: "reference-identity";
  readonly negated: boolean;
  readonly distinctMethodValues?: true;
}

export interface CsharpUnionEqualityArm {
  readonly left: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] };
  readonly right: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] };
  readonly operation: CsharpReferenceEquality | {
    readonly kind: "operator";
    readonly leftInputType: TargetTypeRef;
    readonly rightInputType: TargetTypeRef;
  };
}

export function csharpUnionEqualityArmsEqual(left: readonly CsharpUnionEqualityArm[], right: readonly CsharpUnionEqualityArm[]): boolean {
  return Array.isArray(right) && left.length === right.length && left.every((arm, index) => {
    const selected = right[index];
    if (selected == null || selected.left == null || selected.right == null || selected.operation == null ||
      selected.left.carrier == null || selected.right.carrier == null) return false;
    const sameSide = (left: CsharpUnionEqualityArm["left"], right: CsharpUnionEqualityArm["left"]) =>
      csharpUnionArmMappingsEqual([{ carrier: left.carrier, source: left.path, target: [] }],
        [{ carrier: right.carrier, source: right.path, target: [] }]);
    if (!sameSide(arm.left, selected.left) || !sameSide(arm.right, selected.right)) return false;
    const operation = arm.operation;
    const other = selected.operation;
    return operation.kind === "operator" ? other.kind === "operator" && other.leftInputType != null && other.rightInputType != null &&
      targetTypeRefEquals(operation.leftInputType, other.leftInputType) && targetTypeRefEquals(operation.rightInputType, other.rightInputType)
      : other.kind === "reference-identity" && operation.negated === other.negated &&
        operation.distinctMethodValues === other.distinctMethodValues;
  });
}
