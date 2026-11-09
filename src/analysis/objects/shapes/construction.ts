import type { SourceMemberOrigin } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpNativeTypeIdentity } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers, canonicalCsharpObjectShapeImplementedTypes, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
import { sourceMemberOriginsEqual } from "./member-origins.js";
import { csharpObjectShapeTypeParameters } from "../../../policy/types/callables/owner-environment.js";

export function createStructuralObjectShapeTarget(
  identity: CsharpNativeTypeIdentity,
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  contract = false,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  if (members.length === 0 && (implemented?.length ?? 0) === 0) return csharpEmptyObjectTargetType();
  const canonicalMembers = canonicalCsharpObjectShapeMembers(identity, members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(identity, implemented ?? []);
  const parameters = csharpObjectShapeTypeParameters(canonicalMembers, canonicalImplemented, implementation);
  if (parameters.some(parameter => parameter.csharpConstraints?.kind !== "resolved")) {
    throw new TypeError("A physical shape requires the completed Native constraint definition for each free parameter, not a bare recursive reference.");
  }
  return selectCsharpStructuralObjectCarrier(identity, canonicalMembers, canonicalImplemented,
    parameters, contract, implementation);
}

export function mergeCsharpObjectShapeSubjects(identity: CsharpNativeTypeIdentity, left: CsharpObjectShapeFact, right: CsharpObjectShapeFact): CsharpObjectShapeFact {
  const members = new Map(right.members.map(member => [csharpObjectShapeMemberContractKey(identity, member), member]));
  return Object.freeze({ ...left,
    ...(right.declarationTemplate === undefined ? {} : { declarationTemplate: left.declarationTemplate === undefined
      ? right.declarationTemplate : mergeCsharpObjectShapeSubjects(identity, left.declarationTemplate, right.declarationTemplate) }),
    members: Object.freeze(left.members.map(member => {
      const other = members.get(csharpObjectShapeMemberContractKey(identity, member));
      if (other === undefined) throw new TypeError("Only identical complete physical member inventories can share a shape.");
      const origins: SourceMemberOrigin[] = [...member.origins ?? []];
      for (const origin of other.origins ?? []) if (!origins.some(previous => sourceMemberOriginsEqual(previous, origin))) origins.push(origin);
      return Object.freeze({ ...member,
        origins: Object.freeze(origins),
        sourceDeclarations: Object.freeze([...new Set([...member.sourceDeclarations ?? [], ...other.sourceDeclarations ?? []])]),
        sourceSubjects: Object.freeze([...new Set([...member.sourceSubjects ?? [], ...other.sourceSubjects ?? []])]) });
    })) });
}
