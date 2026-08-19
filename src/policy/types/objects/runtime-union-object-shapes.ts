import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "../model/definitions.js";
import type {
  CsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "./object-shape-members.js";
import {
  getCsharpRuntimeUnionArms,
} from "../storage/runtime-carriers.js";
import {
  targetTypeRefEquals,
} from "../model/equality.js";

export interface CsharpRuntimeUnionObjectShapeMember {
  readonly armIndex: number;
  readonly armType: TargetTypeRef;
  readonly shape: CsharpObjectShapeFact;
  readonly member: CsharpObjectShapeMemberFact;
}

export type CsharpRuntimeUnionObjectShapePropertyResolution =
  | { readonly kind: "not-runtime-union" }
  | {
      readonly kind: "resolved";
      readonly members: readonly CsharpRuntimeUnionObjectShapeMember[];
      readonly resultType: TargetTypeRef;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function resolveCsharpRuntimeUnionObjectShapeProperty(
  objectShapes: CsharpObjectShapePolicy,
  receiverType: TargetTypeRef | undefined,
  selectedSubjects: readonly unknown[],
): CsharpRuntimeUnionObjectShapePropertyResolution {
  const arms = getCsharpRuntimeUnionArms(receiverType);
  if (arms === undefined) {
    return { kind: "not-runtime-union" };
  }
  const members: CsharpRuntimeUnionObjectShapeMember[] = [];
  for (const [armIndex, armType] of arms.entries()) {
    const shape = objectShapes.resolveTarget(armType);
    if (shape === undefined) {
      return {
        kind: "rejected",
        reason:
          `Runtime-union arm ${armIndex + 1} has no finalized object-shape contract for the checker-selected property.`,
      };
    }
    const selected = resolveCsharpObjectShapeMemberBySelectedSubject(
      shape,
      selectedSubjects,
    );
    if (selected.kind !== "resolved") {
      return {
        kind: "rejected",
        reason:
          `Runtime-union arm ${armIndex + 1} does not relate the checker-selected property to one exact object-shape member.`,
      };
    }
    if (selected.member.memberKind !== "property") {
      return {
        kind: "rejected",
        reason:
          `Runtime-union arm ${armIndex + 1} relates the checker-selected property to a non-property object-shape member.`,
      };
    }
    members.push({
      armIndex,
      armType,
      shape,
      member: selected.member,
    });
  }
  const resultType = members[0]?.member.type;
  if (
    resultType === undefined ||
    members.some((entry) => !targetTypeRefEquals(entry.member.type, resultType))
  ) {
    return {
      kind: "rejected",
      reason:
        "Runtime-union object-shape property projection requires one exact common target result representation across every arm.",
    };
  }
  return {
    kind: "resolved",
    members: Object.freeze(members),
    resultType,
  };
}
