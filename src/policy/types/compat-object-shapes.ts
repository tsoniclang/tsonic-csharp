import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  isCsharpCompatValueTargetType,
} from "./runtime-carriers.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "./object-shape-members.js";

export type CsharpCompatObjectShapeMemberResolution =
  | { readonly kind: "not-compat-object-shape" }
  | {
      readonly kind: "resolved";
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function canUseCsharpCompatObjectShapeCarrier(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): boolean {
  return (implemented?.length ?? 0) === 0 &&
    members.every((member) =>
      member.memberKind === "property" &&
      isCsharpCompatValueTargetType(member.type)
    );
}

export function isCsharpCompatObjectShapeTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpCompatObjectShape === true &&
    isCsharpCompatValueTargetType(type);
}

export function validateCsharpCompatObjectShapeCarrier(
  shape: CsharpObjectShapeFact,
): string | undefined {
  if (!isCsharpCompatObjectShapeTargetType(shape.targetType)) {
    return "The structural object shape has no exact closed compatibility-value carrier.";
  }
  return canUseCsharpCompatObjectShapeCarrier(
      shape.members,
      shape.implements,
    )
    ? undefined
    : "The structural object shape no longer agrees with its closed compatibility-value carrier policy.";
}

export function resolveCsharpCompatObjectShapeMember(
  shape: CsharpObjectShapeFact,
  selectedSubjects: readonly unknown[],
): CsharpCompatObjectShapeMemberResolution {
  if (!isCsharpCompatObjectShapeTargetType(shape.targetType)) {
    return { kind: "not-compat-object-shape" };
  }
  const rejection = validateCsharpCompatObjectShapeCarrier(shape);
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
          "The exact selected source property is absent from its finalized compatibility object-shape contract.",
      };
}
