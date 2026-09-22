import { sourceCallableUsesLexicalThis } from "@tsonic/target-api/source";
import type { ExtensionFactSubject } from "@tsonic/tsts";
import type { CsharpTypePolicyHost } from "../resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { csharpGenericMethodValueType } from "../../../target-model/types/generic-method-values.js";
import { csharpSourceMemberKeyParts } from "../../../target-model/types/source-member-keys.js";

export function selectCsharpGenericMethodValue(
  owner: TargetTypeRef | undefined, subjects: readonly ExtensionFactSubject[], host: CsharpTypePolicyHost,
): TargetTypeRef | undefined {
  if (owner === undefined) return undefined;
  const shape = host.structuralTypes.resolveTarget(owner);
  if (shape === undefined) return undefined;
  const member = resolveCsharpObjectShapeMemberBySelectedSubject(shape, subjects);
  if (member.kind !== "resolved" || member.member.memberKind !== "method" ||
      (member.member.typeParameters?.length ?? 0) === 0) return undefined;
  if (shape.methodImplementation !== undefined) {
    const declarations = member.member.sourceDeclarations?.filter(declaration =>
      host.ast.parent(declaration) === shape.methodImplementation!.declaration && host.ast.body(declaration) !== undefined);
    if (declarations?.length !== 1 || sourceCallableUsesLexicalThis(host.ast, declarations[0]!)) return undefined;
  } else if ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true) return undefined;
  const identity = JSON.stringify(csharpSourceMemberKeyParts(member.member.sourceKey));
  return csharpGenericMethodValueType(owner, member.member.targetName, identity,
    member.member.type, member.member.typeParameters!.map(parameter => parameter.name));
}
