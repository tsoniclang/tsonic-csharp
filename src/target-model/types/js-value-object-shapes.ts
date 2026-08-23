import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./model.js";
import {
  csharpTsValueTargetType,
  isCsharpJsValueTargetType,
} from "./runtime-carriers.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "./object-shape-members.js";

export type CsharpJsValueObjectShapeMemberResolution =
  | { readonly kind: "not-js-value-object-shape" }
  | {
      readonly kind: "resolved";
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpJsValueObjectLiteralShapeProjection =
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

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

export function projectCsharpJsValueObjectLiteralShape(
  sourceShape: CsharpObjectShapeFact,
): CsharpJsValueObjectLiteralShapeProjection {
  const unsupportedMember = sourceShape.members.find((member) =>
    member.memberKind !== "property" || member.accessor !== undefined
  );
  if (unsupportedMember !== undefined) {
    return {
      kind: "rejected",
      reason:
        `JS-value object literal member '${unsupportedMember.sourceName}' requires an explicit data-property contract. Methods and accessors cannot be reinterpreted as stored values.`,
    };
  }
  const targetType = {
    ...csharpTsValueTargetType(),
    csharpJsObjectShape: true as const,
  } satisfies CsharpTargetNamedTypeRef;
  const memberType = csharpTsValueTargetType();
  return {
    kind: "resolved",
    shape: {
      targetType,
      members: sourceShape.members.map((member) => ({
        ...member,
        type: memberType,
      })),
    },
  };
}

export function isCsharpJsValueObjectShapeTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsObjectShape === true &&
    isCsharpJsValueTargetType(type);
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
