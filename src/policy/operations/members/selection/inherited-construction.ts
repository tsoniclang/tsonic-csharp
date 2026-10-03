import type { CsharpTargetMember } from "../../../../target-model/types/model.js";
import type { CsharpProviderCallSelectionHost } from "./call-selection.js";
import type { ResolvedSourceCallInfo } from "./selection-types.js";

export function selectCsharpInheritedConstructorTarget(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceCallInfo,
  member: CsharpTargetMember,
): { readonly kind: "resolved"; readonly member: CsharpTargetMember }
  | { readonly kind: "missing"; readonly reason: string } {
  const declaration = source.sourceCallee.selectedDeclaration;
  if (declaration === undefined || !host.navigation.isProjectDeclaration(declaration)) return { kind: "resolved", member };
  const constructor = host.projectTypes.implicitConstructorForSignature(declaration, source.selectedSignature);
  return constructor === undefined || member.kind !== "constructor" || constructor.baseMemberId !== member.id
    ? { kind: "missing", reason: "The project-owned callee has no exact implicit constructor relation for the selected native signature." }
    : { kind: "resolved", member: constructor.targetMember };
}
