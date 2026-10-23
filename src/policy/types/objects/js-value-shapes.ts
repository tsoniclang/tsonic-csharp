import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";

import { isCsharpJsValueObjectShapeTargetType, type CsharpJsValueObjectShapeMemberResolution } from "../../../target-model/types/js-value-object-shapes.js";
export function canUseCsharpJsValueObjectShapeCarrier(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): boolean {
  return (implemented?.length ?? 0) === 0 &&
    members.every((member) =>
      member.sourceKey.kind === "property" &&
      member.memberKind === "property" &&
      member.accessor === undefined &&
      isCsharpJsValueTargetType(member.type)
    );
}

export function validateCsharpJsValueObjectShapeCarrier(
  shape: CsharpObjectShapeFact,
): string | undefined {
  if (!isCsharpJsValueObjectShapeTargetType(shape.targetType)) {
    return "The structural object shape has no exact closed JS-value carrier.";
  }
  return canUseCsharpJsValueObjectShapeCarrier(
      shape.members,
      shape.implements,
    )
    ? undefined
    : "The structural object shape no longer agrees with its closed JS-value carrier policy.";
}

export function resolveCsharpJsValueObjectShapeMember(
  shape: CsharpObjectShapeFact,
  selectedSubjects: readonly unknown[],
): CsharpJsValueObjectShapeMemberResolution {
  if (!isCsharpJsValueObjectShapeTargetType(shape.targetType)) {
    return { kind: "not-js-value-object-shape" };
  }
  const rejection = validateCsharpJsValueObjectShapeCarrier(shape);
  if (rejection !== undefined) {
    return { kind: "rejected", reason: rejection };
  }
  const selected = resolveCsharpObjectShapeMemberBySelectedSubject(
    shape,
    selectedSubjects,
  );
  return selected.kind === "resolved"
    ? { kind: "resolved", member: selected.member }
    : {
        kind: "rejected",
        reason:
          "The exact selected source property is absent from its finalized JS-value object-shape contract.",
      };
}
