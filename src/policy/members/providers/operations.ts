import type {
  ExtensionDiagnostic,
  Node,
  ProviderVirtualDeclarationFact,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../../providers/relations/index.js";
import {
  resolveCsharpProviderDeclarationEvidence,
  resolveCsharpProviderDeclarationEvidenceKinds,
} from "../../../providers/relations/evidence.js";

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

export interface CsharpProviderOperationHost {
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly providers: CsharpProviderRelationResolver;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}

export function resolveCsharpProviderCallRelations(
  host: CsharpProviderOperationHost,
  call: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const semantics = host.semantics(sourceFile);
  const source = semantics.getResolvedCallInfo(call);
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source call.",
    };
  }
  if (source.sourceSelectedSignatureKind !== "resolved") {
    return {
      kind: "missing",
      reason: "The selected source call is untyped.",
    };
  }
  const declaration = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [semantics.getSignatureDeclaration(source.selectedSignature)],
    "signature",
  );
  return resolveProviderRelations(host, declaration, "signature");
}

export function resolveCsharpProviderPropertyRelations(
  host: CsharpProviderOperationHost,
  propertyAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const source = host.semantics(sourceFile).getResolvedPropertyAccessInfo(
    propertyAccess,
  );
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source property access.",
    };
  }
  const declaration = resolveCsharpProviderDeclarationEvidenceKinds(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    ["export", "member"],
  );
  if (declaration.kind !== "resolved") {
    return declaration;
  }
  return resolveProviderRelations(
    host,
    declaration,
    declaration.declarationKind === "export"
      ? "value"
      : "member",
  );
}

export function resolveCsharpProviderElementRelations(
  host: CsharpProviderOperationHost,
  elementAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const source = host.semantics(sourceFile).getResolvedElementAccessInfo(
    elementAccess,
  );
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source element access.",
    };
  }
  const signature = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    "signature",
  );
  if (signature.kind === "resolved" || signature.kind === "conflict") {
    return resolveProviderRelations(host, signature, "signature");
  }
  const member = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    "member",
  );
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
