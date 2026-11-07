// The generated structural object-shape carrier of a member set (canonical members, implemented contracts, owner
// binders). Policy, below representation/ and analysis/ (R8 layer contract): the one mapping (representation/) and
// analysis both build shape carriers through it.
import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers } from "../../../target-model/types/object-shape-identity.js";
import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment } from "./owner-type-parameters.js";
import { selectCsharpStructuralObjectCarrier } from "./shape-carriers.js";

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
