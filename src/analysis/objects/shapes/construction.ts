import type { SourceMemberOrigin } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers, canonicalCsharpObjectShapeImplementedTypes, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { visitCsharpTargetTypeParameters } from "../../../target-model/types/generic-references.js";
import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
import { sourceMemberOriginsEqual } from "./member-origins.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../../target-model/types/generic-constraints.js";
import { csharpNativeCallableMemberComponents } from "../../../target-model/types/components.js";

export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  contract = false,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  if (members.length === 0 && (implemented?.length ?? 0) === 0) return csharpEmptyObjectTargetType();
  const canonicalMembers = canonicalCsharpObjectShapeMembers(members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(implemented ?? []);
  const parameters = new Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
  const retain = (type: TargetTypeRef, bound: ReadonlySet<string>): void => {
    visitCsharpTargetTypeParameters(type, parameter => {
      if (bound.has(parameter.identity)) return;
      const previous = parameters.get(parameter.identity);
      if (previous !== undefined && targetTypeRefKey(previous) !== targetTypeRefKey(parameter)) throw new TypeError("A physical shape parameter has contradictory Native identities.");
      if (previous?.csharpConstraints?.kind === "resolved" && parameter.csharpConstraints?.kind === "resolved" &&
        csharpTypeParameterConstraintResolutionKey(previous.csharpConstraints) !== csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints)) {
        throw new TypeError("A physical shape parameter has contradictory completed Native constraints.");
      }
      if (previous?.csharpConstraints?.kind !== "resolved") parameters.set(parameter.identity, parameter);
    });
  };
  for (const member of canonicalMembers) {
    retain(member.type, new Set());
    if (member.methodValueStorage !== undefined) retain(member.methodValueStorage.type, new Set());
    if (member.memberKind === "method") for (const method of member.methods) {
      for (const signature of [method.member, method.value]) {
        const bound = new Set(signature.typeParameters.map(parameter => parameter.identity));
        for (const type of csharpNativeCallableMemberComponents(signature)) retain(type, bound);
      }
    }
  }
  for (const type of canonicalImplemented) retain(type, new Set());
  for (const capture of implementation?.captures ?? []) retain(capture.type, new Set());
  if ([...parameters.values()].some(parameter => parameter.csharpConstraints?.kind !== "resolved")) {
    throw new TypeError("A physical shape requires the completed Native constraint definition for each free parameter, not a bare recursive reference.");
  }
  return selectCsharpStructuralObjectCarrier(canonicalMembers, canonicalImplemented,
    Object.freeze([...parameters.values()]), contract, implementation);
}

export function mergeCsharpObjectShapeSubjects(left: CsharpObjectShapeFact, right: CsharpObjectShapeFact): CsharpObjectShapeFact {
  const members = new Map(right.members.map(member => [csharpObjectShapeMemberContractKey(member), member]));
  return Object.freeze({ ...left,
    ...(right.declarationTemplate === undefined ? {} : { declarationTemplate: left.declarationTemplate === undefined
      ? right.declarationTemplate : mergeCsharpObjectShapeSubjects(left.declarationTemplate, right.declarationTemplate) }),
    members: Object.freeze(left.members.map(member => {
      const other = members.get(csharpObjectShapeMemberContractKey(member));
      if (other === undefined) throw new TypeError("Only identical complete physical member inventories can share a shape.");
      const origins: SourceMemberOrigin[] = [...member.origins ?? []];
      for (const origin of other.origins ?? []) if (!origins.some(previous => sourceMemberOriginsEqual(previous, origin))) origins.push(origin);
      return Object.freeze({ ...member,
        origins: Object.freeze(origins),
        sourceDeclarations: Object.freeze([...new Set([...member.sourceDeclarations ?? [], ...other.sourceDeclarations ?? []])]),
        sourceSubjects: Object.freeze([...new Set([...member.sourceSubjects ?? [], ...other.sourceSubjects ?? []])]) });
    })) });
}
