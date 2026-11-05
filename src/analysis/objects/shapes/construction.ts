import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";

import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment } from "../../source-evidence/types/resolution/owner-type-parameter-environment.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";
export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  environment: CsharpTypeParameterEnvironment,
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
        ...(member.sourceDeclarations ?? []),
        ...(other.sourceDeclarations ?? []),
      ]);
      const declarations = member.sourceDeclarations;
      const otherDeclarations = other.sourceDeclarations;
      const currentDeclarations = declarations === undefined ? otherDeclarations
        : otherDeclarations === undefined || declarations.length === otherDeclarations.length &&
          declarations.every(declaration => otherDeclarations.includes(declaration)) ? declarations : [];
      const sourceTypes = new Set([
        ...(member.sourceTypes ?? []),
        ...(other.sourceTypes ?? []),
      ]);
      const origins = [...(member.origins ?? []), ...(other.origins ?? [])].filter((origin, index, alternatives) =>
        alternatives.findIndex(candidate => sourceTypeDescriptorMemberOriginsEqual(candidate, origin)) === index);
      const sourceMemberEvidence = [...(member.sourceMemberEvidence ?? []), ...(other.sourceMemberEvidence ?? [])]
        .filter((evidence, index, alternatives) => alternatives.findIndex(candidate =>
          candidate.ownerType === evidence.ownerType && candidate.sourceType === evidence.sourceType &&
          candidate.correspondence === evidence.correspondence) === index);
      const { sourceDeclarations: _sourceDeclarations, ...physicalMember } = member;
      return {
        ...physicalMember,
        ...(currentDeclarations === undefined ? {} : { sourceDeclarations: Object.freeze([...currentDeclarations]) }),
        ...(origins.length === 0 ? {} : { origins: Object.freeze(origins) }),
        ...(sourceMemberEvidence.length === 0 ? {} : { sourceMemberEvidence: Object.freeze(sourceMemberEvidence) }),
        ...(subjects.size === 0
          ? {}
          : { sourceSubjects: Object.freeze([...subjects]) }),
        ...(sourceTypes.size === 0
          ? {}
          : { sourceTypes: Object.freeze([...sourceTypes]) }),
      };
    }),
  };
}
