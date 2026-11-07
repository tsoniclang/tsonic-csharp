import type { CsharpProviderOperationHost } from "../../../policy/model/provider-calls.js";
import type { ExtensionDiagnostic, Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import { sourceCallSelection, sourceMemberAccess } from "../../program/source-facts.js";

import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { resolveCsharpProviderDeclarationEvidence, resolveCsharpProviderDeclarationEvidenceKinds } from "../../../source/extension/provider-identities.js";

export type CsharpProviderOperationResolution =
  | {
      readonly kind: "resolved";
      readonly declaration: ProviderVirtualDeclarationFact;
      readonly relations: readonly CsharpProviderTargetRelation[];
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
      readonly reason: string;
      readonly declarations: readonly ProviderVirtualDeclarationFact[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export function resolveCsharpProviderCallRelations(
  host: CsharpProviderOperationHost,
  call: Node,
): CsharpProviderOperationResolution {
  const source = sourceCallSelection(host.facts, call);
  const declaration = resolveCsharpProviderDeclarationEvidence(host.sourceFacts, [source.signature], "signature");
  return resolveProviderRelations(host, declaration, "signature");
}

export function resolveCsharpProviderPropertyRelations(
  host: CsharpProviderOperationHost,
  propertyAccess: Node,
): CsharpProviderOperationResolution {
  const source = sourceMemberAccess(host.facts, propertyAccess);
  const declarations = source.selected.kind === "member" ? source.selected.declarations : [source.selected.declaration];
  const declaration = resolveCsharpProviderDeclarationEvidenceKinds(host.sourceFacts, declarations, ["export", "member"]);
  if (declaration.kind !== "resolved") {
    return declaration;
  }
  return resolveProviderRelations(host, declaration, declaration.declarationKind === "export" ? "value" : "member");
}

export function resolveCsharpProviderElementRelations(
  host: CsharpProviderOperationHost,
  elementAccess: Node,
): CsharpProviderOperationResolution {
  const selected = host.facts.values.elementAccess(elementAccess).selected;
  if (selected.kind !== "member" && selected.kind !== "index-signature") {
    return { kind: "missing", reason: "The selected source element access has no provider member or index signature." };
  }
  const signature = resolveCsharpProviderDeclarationEvidence(host.sourceFacts, [selected.declaration], "signature");
  if (signature.kind === "resolved" || signature.kind === "conflict") {
    return resolveProviderRelations(host, signature, "signature");
  }
  const member = resolveCsharpProviderDeclarationEvidence(host.sourceFacts, [selected.declaration], "member");
  return resolveProviderRelations(host, member, "member");
}

function resolveProviderRelations(
  host: CsharpProviderOperationHost,
  declaration:
    ReturnType<typeof resolveCsharpProviderDeclarationEvidence>,
  expectedKind: CsharpProviderTargetRelation["kind"],
): CsharpProviderOperationResolution {
  if (declaration.kind !== "resolved") {
    return declaration;
  }
  const resolution = expectedKind === "type"
    ? host.providers.resolveType(declaration.declaration)
    : expectedKind === "value"
      ? host.providers.resolveValue(declaration.declaration)
      : expectedKind === "member"
        ? host.providers.resolveMember(declaration.declaration)
        : host.providers.resolveSignature(declaration.declaration);
  if (resolution.kind !== "resolved") {
    return resolution;
  }
  const relations = uniqueTargetRelations(
    resolution.relations.filter((relation) => relation.kind === expectedKind),
  );
  return relations.length === 0
    ? {
        kind: "missing",
        reason:
          `The selected provider ${expectedKind} identity has no C# target relation.`,
      }
    : {
        kind: "resolved",
        declaration: declaration.declaration,
        relations,
      };
}

function uniqueTargetRelations(
  relations: readonly CsharpProviderTargetRelation[],
): readonly CsharpProviderTargetRelation[] {
  const byIdentity = new Map<string, CsharpProviderTargetRelation>();
  for (const relation of relations) {
    const key = relation.kind === "type"
      ? relation.targetBinding.id
      : `${relation.targetBinding.id}\u0000${relation.targetMember.id}`;
    byIdentity.set(key, relation);
  }
  return Object.freeze([...byIdentity.values()]);
}
