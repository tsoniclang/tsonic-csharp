import type { ExtensionFactSubject } from "@tsonic/tsts";
import type { CsharpTypePolicyHost } from "../resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { csharpMethodValueType, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { csharpSourceMemberKeyParts } from "../../../target-model/types/source-member-keys.js";
import { csharpMethodEnvironment } from "./object-shape-policy/method-values.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";

export function selectCsharpMethodValue(
  owner: TargetTypeRef | undefined, subjects: readonly ExtensionFactSubject[], host: CsharpTypePolicyHost, directCall = false,
): TargetTypeRef | undefined {
  if (owner === undefined) return undefined;
  const shape = host.structuralTypes.resolveTarget(owner);
  if (shape === undefined) return undefined;
  const member = resolveCsharpObjectShapeMemberBySelectedSubject(shape, subjects);
  if (member.kind !== "resolved" || member.member.memberKind !== "method" || member.member.methodValueContract === undefined) return undefined;
  if (directCall && member.member.optional !== true) return undefined;
  if (member.member.methodStorageType === undefined && shape.methodImplementation !== undefined) {
    const declarations = member.member.sourceDeclarations?.filter(declaration =>
      host.ast.parent(declaration) === shape.methodImplementation!.declaration && host.ast.body(declaration) !== undefined);
    if (declarations?.length !== 1) return undefined;
  } else if (member.member.methodStorageType === undefined && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return undefined;
  const environment = csharpMethodEnvironment(shape, member.member);
  if (environment === undefined) return undefined;
  const identity = JSON.stringify(csharpSourceMemberKeyParts(member.member.sourceKey));
  const signature = csharpPresentObjectShapeMethod(member.member);
  const value = signature === undefined ? undefined : csharpMethodValueType(environment, member.member.targetName, identity,
    signature.type, (member.member.typeParameters ?? []).map(parameter => parameter.identity));
  return value === undefined || member.member.optional !== true ? value : csharpNullableTargetType(value);
}
