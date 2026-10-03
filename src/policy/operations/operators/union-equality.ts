import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpUnionEqualityArm } from "../../../target-model/operations/binary.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { csharpAbsenceTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
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
  const leftPresent = getCsharpNullableElementTargetType(left) ?? left;
  const rightPresent = getCsharpNullableElementTargetType(right) ?? right;
  const leftUnion = getCsharpRuntimeUnionArms(leftPresent, input.typeDefinitions);
  const rightUnion = getCsharpRuntimeUnionArms(rightPresent, input.typeDefinitions);
  if (leftUnion === undefined && rightUnion === undefined) return undefined;
  const leftLeaves = equalityLeaves(left, leftPresent, leftUnion !== undefined, input);
  const rightLeaves = equalityLeaves(right, rightPresent, rightUnion !== undefined, input);
  if (leftLeaves === undefined || rightLeaves === undefined) return undefined;
  const arms: CsharpUnionEqualityArm[] = [];
  for (const left of leftLeaves) for (const right of rightLeaves) {
    if (isCsharpAbsenceTargetType(left.carrier) !== isCsharpAbsenceTargetType(right.carrier)) continue;
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
    const leftKind = getCsharpTypeofRuntimeKind(left.carrier, input.typeDefinitions);
    const rightKind = getCsharpTypeofRuntimeKind(right.carrier, input.typeDefinitions);
    if (leftKind === undefined || rightKind === undefined || leftKind === rightKind) return undefined;
  }
  return Object.freeze(arms);
}

function equalityLeaves(
  storage: TargetTypeRef,
  present: TargetTypeRef,
  union: boolean,
  input: CsharpPolicyContext,
): readonly CsharpUnionEqualityArm["left"][] | undefined {
  if (isCsharpAbsenceTargetType(storage)) return [{ carrier: storage, path: Object.freeze([]) }];
  const leaves = union ? csharpUnionLeaves(present, input.typeDefinitions)
    : [{ carrier: present, path: Object.freeze([]) }];
  return leaves === undefined || getCsharpNullableElementTargetType(storage) === undefined ? leaves
    : [...leaves, { carrier: csharpAbsenceTargetType(), path: Object.freeze([]) }];
}
