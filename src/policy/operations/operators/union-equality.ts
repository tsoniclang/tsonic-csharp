import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpUnionEqualityArm } from "../../../target-model/operations/binary.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpNumericCarrierPromotion } from "../numeric/promotion.js";
import { validateBinaryTargetSemantics } from "./operator-validation.js";
import { selectCsharpReferenceEquality } from "./reference-equality.js";

export function selectCsharpUnionEquality(
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): readonly CsharpUnionEqualityArm[] | undefined {
  const leftUnion = getCsharpRuntimeUnionArms(left, input.typeDefinitions);
  const rightUnion = getCsharpRuntimeUnionArms(right, input.typeDefinitions);
  if (leftUnion === undefined && rightUnion === undefined) return undefined;
  const leftLeaves = leftUnion === undefined ? [{ carrier: left, path: Object.freeze([]) }] : csharpUnionLeaves(left, input.typeDefinitions);
  const rightLeaves = rightUnion === undefined ? [{ carrier: right, path: Object.freeze([]) }] : csharpUnionLeaves(right, input.typeDefinitions);
  if (leftLeaves === undefined || rightLeaves === undefined) return undefined;
  const arms: CsharpUnionEqualityArm[] = [];
  for (const left of leftLeaves) for (const right of rightLeaves) {
    const identity = selectCsharpReferenceEquality("===", left.carrier, right.carrier, input);
    const promotion = selectCsharpNumericCarrierPromotion(left.carrier, right.carrier);
    const intrinsic = (targetTypeRefEquals(left.carrier, right.carrier) || promotion !== undefined) &&
      validateBinaryTargetSemantics("===", left.carrier, right.carrier, input) === undefined;
    if (identity !== undefined || intrinsic) {
      arms.push(Object.freeze({ left: Object.freeze(left), right: Object.freeze(right),
        operation: Object.freeze(identity ?? { kind: "operator" as const, leftInputType: promotion?.leftType ?? left.carrier,
          rightInputType: promotion?.rightType ?? right.carrier }) }));
      continue;
    }
    const leftKind = getCsharpTypeofRuntimeKind(left.carrier);
    const rightKind = getCsharpTypeofRuntimeKind(right.carrier);
    if (leftKind === undefined || rightKind === undefined || leftKind === rightKind) return undefined;
  }
  return Object.freeze(arms);
}
