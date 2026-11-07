import type { SourceCallSelection } from "@tsonic/target-api/source";
import type { CsharpTargetMember } from "../../../../target-model/types/model.js";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";

/** A project class without an authored constructor forwards to the selected native base constructor (Host call selection). */
export function selectCsharpInheritedConstructorTarget(
  host: CsharpProviderCallSelectionHost,
  source: SourceCallSelection,
  member: CsharpTargetMember,
): { readonly kind: "resolved"; readonly member: CsharpTargetMember }
  | { readonly kind: "missing"; readonly reason: string } {
  const declaration = source.declaration;
  if (declaration === undefined || !host.facts.navigation.identity.isProjectDeclaration(declaration)) return { kind: "resolved", member };
  const constructor = host.projectTypes.implicitConstructorForSignature(declaration, source.signature,
    source.parameters.map(parameter => parameter.type));
  if (constructor === undefined && member.kind !== "constructor") return { kind: "resolved", member };
  return constructor === undefined || member.kind !== "constructor" || constructor.baseMemberId !== member.id
    ? { kind: "missing", reason: "The project-owned callee has no exact implicit constructor relation for the selected native signature." }
    : { kind: "resolved", member: constructor.targetMember };
}
