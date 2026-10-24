import type { ExtensionFactSubject } from "@tsonic/tsts";
import type { CsharpTypePolicyHost } from "../source-evidence/types/resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { csharpMethodValueType, csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../target-model/types/method-values.js";
import { csharpSourceMemberKeyParts } from "../../target-model/types/source-member-keys.js";
import { selectCsharpMethodValueEnvironment } from "../../policy/types/objects/method-environments.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";

export function selectCsharpMethodValue(
  owner: TargetTypeRef | undefined, subjects: readonly ExtensionFactSubject[], host: CsharpTypePolicyHost, role: "value" | "call" | "storage",
): TargetTypeRef | undefined {
  if (owner === undefined) return undefined;
  const shape = host.structuralTypes.resolveTarget(owner);
  if (shape === undefined) return undefined;
  const member = resolveCsharpObjectShapeMemberBySelectedSubject(shape, subjects);
  if (member.kind !== "resolved" || member.member.memberKind !== "method" || member.member.methodValueContract === undefined) return undefined;
  if (role === "call" && member.member.optional !== true || role === "storage" && member.member.methodValueStorage === undefined) return undefined;
  if (member.member.methodValueStorage === undefined && shape.methodImplementation !== undefined) {
    if (csharpObjectShapeMethodDeclaration(shape, member.member) === undefined) return undefined;
  } else if (member.member.methodValueStorage === undefined && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return undefined;
  const environment = selectCsharpMethodValueEnvironment(shape, member.member);
  if (environment?.kind !== "protocol") return undefined;
  const identity = JSON.stringify(csharpSourceMemberKeyParts(member.member.sourceKey));
  const signature = csharpPresentObjectShapeMethod(member.member);
  const value = signature === undefined ? undefined : csharpMethodValueType(environment.type, environment.invocationName, identity,
    signature.type, (member.member.typeParameters ?? []).map(parameter => parameter.identity));
  return value === undefined || member.member.optional !== true ? value : csharpNullableTargetType(value);
}
