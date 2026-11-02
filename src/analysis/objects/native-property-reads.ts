import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { selectCsharpErrorNativeProperty } from "../../policy/operations/source-profiles/error-source-profile.js";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection.js";
import type { CsharpNativePropertyRead } from "../../target-model/records/program/source-profile-invocations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

type NativePropertyReadHost = Pick<CsharpPolicyContext,
  "ast" | "sourceFacts" | "providers" | "projectTypes" | "typeDefinitions">;

export function resolveCsharpCheckedNativePropertyRead(
  checked: Type | undefined,
  sourceName: string,
  receiverCarrier: TargetTypeRef | undefined,
  semantics: SourceFileSemantics,
  host: NativePropertyReadHost,
): { readonly kind: "not-native"; readonly sourceType?: Type } | { readonly kind: "unresolved" } |
  { readonly kind: "resolved"; readonly sourceType: Type; readonly property: CsharpNativePropertyRead } {
  if (receiverCarrier === undefined) return { kind: "unresolved" };
  if (checked === undefined) return { kind: "not-native" };
  const correspondence = semantics.types.structuralMembers(checked, checked, "read");
  if (correspondence.kind !== "available") return { kind: "not-native" };
  const members = correspondence.members.filter(pair => pair.destination.property.name === sourceName);
  if (members.length !== 1 || members[0]!.kind !== "present") return { kind: "not-native" };
  const member = members[0]!;
  const sourceType = member.source.property.type;
  const selected = resolveCsharpNativePropertyRead(member.source.declarations, receiverCarrier, semantics, host);
  return selected.kind === "unresolved" ? selected : { ...selected, sourceType };
}

export function resolveCsharpNativePropertyRead(
  declarations: readonly (Node | undefined)[],
  receiverCarrier: TargetTypeRef | undefined,
  semantics: SourceFileSemantics,
  host: NativePropertyReadHost,
): { readonly kind: "not-native" } | { readonly kind: "unresolved" } |
  { readonly kind: "resolved"; readonly property: CsharpNativePropertyRead } {
  if (receiverCarrier === undefined) return { kind: "unresolved" };
  const selections = [...new Set(declarations)].flatMap(declaration => {
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, semantics, host.sourceFacts, declaration);
    if (identity?.kind !== "member") return [];
    const selected = selectCsharpErrorNativeProperty(host, identity, receiverCarrier);
    return selected === undefined ? [] : [{ identity, selected }];
  });
  if (selections.length === 0) return { kind: "not-native" };
  if (selections.length !== 1) return { kind: "unresolved" };
  const { identity, selected } = selections[0]!;
  if (selected.kind !== "resolved" || selected.invocation.kind !== "member" && selected.invocation.kind !== "receiver-call") {
    return { kind: "unresolved" };
  }
  const admitted = selectCsharpBindingPatternProjection({ kind: "native-member", property: Object.freeze({
    declaration: identity.declaration, member: selected.targetMember, receiver: selected.receiver, invocation: selected.invocation,
  }) });
  return admitted.kind !== "element" || admitted.element.kind !== "native-member" ? { kind: "unresolved" }
    : { kind: "resolved", property: admitted.element.property };
}
