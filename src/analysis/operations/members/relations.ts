import type { ExtensionDiagnostic, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { SourceApplication, SourceMemberUse } from "@tsonic/target-api/source";
import type { CsharpProviderOperationHost } from "../../../policy/model/provider-calls.js";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { resolveCsharpProviderDeclarationEvidence, resolveCsharpProviderDeclarationEvidenceKinds } from "../../../source/extension/provider-identities.js";

export type CsharpProviderOperationResolution =
  | { readonly kind: "resolved"; readonly declaration: ProviderVirtualDeclarationFact; readonly relations: readonly CsharpProviderTargetRelation[] }
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "conflict"; readonly reason: string; readonly declarations: readonly ProviderVirtualDeclarationFact[] }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic };

export function resolveCsharpProviderCallRelations(
  host: CsharpProviderOperationHost, application: SourceApplication,
): CsharpProviderOperationResolution {
  const identity = application.identity.signature;
  return resolveProviderRelations(host, resolveCsharpProviderDeclarationEvidence(host.facts.navigation,
    [identity.declaration, identity.owner], "signature"), "signature");
}

export function resolveCsharpProviderMemberRelations(
  host: CsharpProviderOperationHost, use: SourceMemberUse,
): CsharpProviderOperationResolution {
  const declarations = [...use.selectedDeclarations, ...use.readDeclarations, ...use.writeDeclarations,
    ...use.arms.flatMap(arm => arm.kind === "member"
      ? [...arm.declarations, ...arm.readDeclarations, ...arm.writeDeclarations] : arm.selection.declarations)];
  const selected = resolveCsharpProviderDeclarationEvidenceKinds(host.facts.navigation, declarations,
    ["export", "member", "signature"]);
  return resolveProviderRelations(host, selected, selected.kind === "resolved"
    ? selected.declarationKind === "export" ? "value" : selected.declarationKind === "signature" ? "signature" : "member" : "member");
}

function resolveProviderRelations(
  host: CsharpProviderOperationHost,
  declaration: ReturnType<typeof resolveCsharpProviderDeclarationEvidence>,
  kind: CsharpProviderTargetRelation["kind"],
): CsharpProviderOperationResolution {
  if (declaration.kind !== "resolved") return declaration;
  const resolution = kind === "type" ? host.providers.resolveType(declaration.declaration)
    : kind === "value" ? host.providers.resolveValue(declaration.declaration)
    : kind === "member" ? host.providers.resolveMember(declaration.declaration)
    : host.providers.resolveSignature(declaration.declaration);
  if (resolution.kind !== "resolved") return resolution;
  const selected = new Map<string, CsharpProviderTargetRelation>();
  for (const relation of resolution.relations) {
    if (relation.kind !== kind) continue;
    const identity = relation.kind === "type" ? relation.targetBinding.id
      : `${relation.targetBinding.id}\u0000${relation.targetMember.id}`;
    selected.set(identity, relation);
  }
  return selected.size === 0 ? { kind: "missing", reason: `The selected provider ${kind} identity has no Native C# relation.` }
    : Object.freeze({ kind: "resolved", declaration: declaration.declaration, relations: Object.freeze([...selected.values()]) });
}
