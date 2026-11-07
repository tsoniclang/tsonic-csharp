import { csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";

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
      const origins = [...(member.origins ?? []), ...(other.origins ?? [])].filter((origin, index, alternatives) =>
        alternatives.findIndex(candidate => sourceTypeDescriptorMemberOriginsEqual(candidate, origin)) === index);
      const { sourceDeclarations: _sourceDeclarations, ...physicalMember } = member;
      return {
        ...physicalMember,
        ...(currentDeclarations === undefined ? {} : { sourceDeclarations: Object.freeze([...currentDeclarations]) }),
        ...(origins.length === 0 ? {} : { origins: Object.freeze(origins) }),
        ...(subjects.size === 0
          ? {}
          : { sourceSubjects: Object.freeze([...subjects]) }),
      };
    }),
  };
}
