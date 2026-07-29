import type {
  ExtensionDiagnostic,
  Node,
  ProviderVirtualDeclarationFact,
  ReadonlySourceFactResolver,
  SourceFile,
  SourceFileQueries,
} from "@tsonic/tsts";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../provider/target-relations/index.js";
import {
  resolveCsharpProviderDeclarationEvidence,
} from "./provider-evidence.js";

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
  queries(sourceFile: SourceFile): SourceFileQueries;
}

export function resolveCsharpProviderCallRelations(
  host: CsharpProviderOperationHost,
  call: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const queries = host.queries(sourceFile);
  const source = queries.checker.getResolvedCallInfo(call);
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
    [queries.checker.getSignatureDeclaration(source.selectedSignature)],
    "signature",
  );
  return resolveProviderRelations(host, declaration, "signature");
}

export function resolveCsharpProviderPropertyRelations(
  host: CsharpProviderOperationHost,
  propertyAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const source = host.queries(sourceFile).checker.getResolvedPropertyAccessInfo(
    propertyAccess,
  );
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source property access.",
    };
  }
  const declaration = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    "member",
  );
  return resolveProviderRelations(host, declaration, "member");
}

export function resolveCsharpProviderElementRelations(
  host: CsharpProviderOperationHost,
  elementAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderOperationResolution {
  const source = host.queries(sourceFile).checker.getResolvedElementAccessInfo(
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
  const resolution = expectedKind === "member"
    ? host.providers.resolveMember(declaration.declaration)
    : expectedKind === "signature"
      ? host.providers.resolveSignature(declaration.declaration)
      : host.providers.resolveType(declaration.declaration);
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
