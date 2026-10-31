import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";

import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { type CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment } from "../../source-evidence/types/resolution/owner-type-parameter-environment.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  environment: CsharpTypeParameterConstraintResolver,
  contract = false,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  if (members.length === 0 && (implemented?.length ?? 0) === 0) {
    return csharpEmptyObjectTargetType();
  }
  const canonicalMembers = canonicalCsharpObjectShapeMembers(members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(
    (implemented ?? []).filter(type => !members.some(member => member.methodValueContract !== undefined &&
      targetTypeRefKey(member.methodValueContract) === targetTypeRefKey(type))),
  );
  const typeParameters = closeCsharpOwnerTypeParameterEnvironment(csharpObjectShapeTypeParameters(
    canonicalMembers, canonicalImplemented, implementation,
  ), environment);
  return selectCsharpStructuralObjectCarrier(canonicalMembers, canonicalImplemented, typeParameters, contract, implementation);
}

export function mergeCsharpObjectShapeSubjects(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): CsharpObjectShapeFact {
  const rightMembers = new Map(
    right.members.map((member) => [
      csharpObjectShapeMemberContractKey(member),
      member,
    ]),
  );
  return {
    ...left,
    ...(left.sourceType === undefined && right.sourceType !== undefined ? { sourceType: right.sourceType } : {}),
    ...(right.declarationTemplate === undefined ? {} : {
      declarationTemplate: left.declarationTemplate === undefined ? right.declarationTemplate
        : mergeCsharpObjectShapeSubjects(left.declarationTemplate, right.declarationTemplate),
    }),
    members: left.members.map((member) => {
      const other = rightMembers.get(
        csharpObjectShapeMemberContractKey(member),
      )!;
      const subjects = new Set([
        ...(member.sourceSubjects ?? []),
        ...(other.sourceSubjects ?? []),
      ]);
      const sourceTypes = new Set([
        ...(member.sourceTypes ?? []),
        ...(other.sourceTypes ?? []),
      ]);
      const sourceDeclarations = new Set([
        ...(member.sourceDeclarations ?? []),
        ...(other.sourceDeclarations ?? []),
      ]);
      const sourceMemberEvidence = [...(member.sourceMemberEvidence ?? []), ...(other.sourceMemberEvidence ?? [])]
        .filter((evidence, index, alternatives) => alternatives.findIndex(candidate =>
          candidate.ownerType === evidence.ownerType && candidate.sourceType === evidence.sourceType &&
          candidate.correspondence === evidence.correspondence) === index);
      return {
        ...member,
        ...(sourceMemberEvidence.length === 0 ? {} : { sourceMemberEvidence: Object.freeze(sourceMemberEvidence) }),
        ...(subjects.size === 0
          ? {}
          : { sourceSubjects: Object.freeze([...subjects]) }),
        ...(sourceTypes.size === 0
          ? {}
          : { sourceTypes: Object.freeze([...sourceTypes]) }),
        ...(sourceDeclarations.size === 0
          ? {}
          : { sourceDeclarations: Object.freeze([...sourceDeclarations]) }),
      };
    }),
  };
}
