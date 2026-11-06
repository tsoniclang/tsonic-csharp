import type { Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceFileSemantics, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { selectCsharpErrorNativeProperty } from "../../policy/operations/source-profiles/error-source-profile.js";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection.js";
import type { CsharpNativePropertyRead } from "../../target-model/records/program/source-profile-invocations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

type NativePropertyReadHost = Pick<CsharpPolicyContext,
  "ast" | "sourceFacts" | "providers" | "projectTypes" | "typeDefinitions">;

export function resolveCsharpPublishedNativePropertyRead(
  descriptor: SourceTypeDescriptor | undefined,
  sourceName: string,
  receiverCarrier: TargetTypeRef | undefined,
  semantics: SourceFileSemantics,
  host: NativePropertyReadHost,
): { readonly kind: "not-native"; readonly sourceType?: SourceTypeDescriptor } | { readonly kind: "unresolved" } |
  { readonly kind: "resolved"; readonly sourceType: SourceTypeDescriptor; readonly property: CsharpNativePropertyRead } {
  if (receiverCarrier === undefined) return { kind: "unresolved" };
  const structure = descriptor === undefined ? undefined : sourceTypeDescriptorStructure(descriptor);
  if (structure?.kind !== "shape") return { kind: "not-native" };
  const members = structure.members.filter(member => member.name === sourceName);
  if (members.length !== 1) return { kind: "not-native" };
  const member = members[0]!;
  const sourceType = member.type;
  if (member.origin.kind !== "declared") return { kind: "not-native", sourceType };
  const selected = resolveCsharpNativePropertyRead([member.origin.declaration], receiverCarrier, semantics, host);
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
