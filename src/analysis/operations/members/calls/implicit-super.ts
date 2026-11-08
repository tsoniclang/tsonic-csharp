import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpTargetMember } from "../../../../target-model/types/model.js";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";

export function selectCsharpInheritedConstructorTarget(
  host: CsharpProviderCallSelectionHost, source: SourceApplication, member: CsharpTargetMember,
): { readonly kind: "resolved"; readonly member: CsharpTargetMember } | { readonly kind: "missing"; readonly reason: string } {
  const declaration = source.identity.signature.owner;
  if (source.identity.signature.kind !== "construct" || !host.facts.navigation.isProjectDeclaration(declaration)) {
    return { kind: "resolved", member };
  }
  const constructor = host.projectTypes.implicitConstructorForSignature(declaration, source.identity.signature);
  if (constructor === undefined && member.kind !== "constructor") return { kind: "resolved", member };
  return constructor === undefined || member.kind !== "constructor" || constructor.baseMemberId !== member.id
    ? { kind: "missing", reason: "The project-owned original constructor signature has no exact inherited Native constructor relation." }
    : { kind: "resolved", member: constructor.targetMember };
}
