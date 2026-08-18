import type {
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../policy/types/model/definitions.js";
import type { TargetBackendContext } from "@tsonic/target-api";
import {
  readCsharpReflectionReferencePaths,
  readCsharpTargetFramework,
} from "../../options/csharp-target-options.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../dotnet/reflection/provider.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "../dotnet/reflection/provider.js";
import {
  resolveDotnetProviderTargetRelations,
} from "../dotnet/relations/target-relation-resolver.js";
import {
  createCapabilityDotnetProviders,
} from "../dotnet/contributions.js";
import type {
  CsharpProviderTargetRelation,
} from "../relations/index.js";
import {
  assertCsharpProviderPolicyIsNonContradictory,
  createCsharpProviderRejectionCatalog,
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
  providerValueSourceIdentity,
} from "../relations/index.js";
import {
  collectCsharpCapabilityContributions,
} from "../dotnet/contributions.js";
import {
  csharpBuiltInProviderPolicies,
} from "../builtins/native-pointer-relations.js";
import type {
  CsharpProviderRelationResolution,
  CsharpProviderRelationResolver,
} from "../model/relation-resolver.js";

export function createCsharpProviderRelationResolver(
  context: TargetBackendContext,
): CsharpProviderRelationResolver {
  const contributions = collectCsharpCapabilityContributions(context);
  const builtIn = createDotnetReflectionTypeDataProvider({
    references: readCsharpReflectionReferencePaths(
      context.target,
      context.projectDirectory,
    ),
    targetFramework: readCsharpTargetFramework(context.target),
  });
  const providers = Object.freeze([
    builtIn,
    ...createCapabilityDotnetProviders(context, contributions).map(
      (registration) => registration.provider,
    ),
  ]);
  const staticCatalogs = [
    ...csharpBuiltInProviderPolicies().map((policy) => ({
      ...policy,
      rejections: [],
    })),
    ...contributions.providerPolicies,
  ].map((contribution) => ({
    providerId: contribution.providerId,
    providerVersion: contribution.providerVersion,
    relationCatalog: createCsharpProviderRelationCatalog([
      contribution.relations,
    ]),
    rejectionCatalog: createCsharpProviderRejectionCatalog([
      contribution.rejections,
    ]),
  })).map((policy) => {
    assertCsharpProviderPolicyIsNonContradictory(
      policy.relationCatalog,
      policy.rejectionCatalog,
    );
    return policy;
  });
  const staticBindings = uniqueStaticBindings(
    staticCatalogs.flatMap((entry) =>
      entry.relationCatalog.relations.map((relation) =>
        relation.targetBinding)),
  );
  assertUniqueProviderIdentities(providers);
  assertUniqueProviderSources(providers, staticCatalogs);
  const resolve = (
    declaration: ProviderVirtualDeclarationFact | undefined,
    kind: CsharpProviderTargetRelation["kind"],
  ): CsharpProviderRelationResolution => {
    if (declaration === undefined) {
      return {
        kind: "missing",
        reason: "Selected source declaration has no provider identity fact.",
      };
    }
    const provider = providers.find((candidate) =>
      candidate.identity.id === declaration.providerId &&
      candidate.identity.version === declaration.providerVersion);
    if (provider !== undefined) {
      return resolveDotnetProviderTargetRelations(provider, declaration, kind);
    }
    const staticCatalog = staticCatalogs.find((candidate) =>
      candidate.providerId === declaration.providerId &&
      candidate.providerVersion === declaration.providerVersion);
    if (staticCatalog === undefined) {
      return {
        kind: "missing",
        reason:
          `No C# target provider owns '${declaration.providerId}@${declaration.providerVersion}'.`,
      };
    }
    switch (kind) {
      case "type": {
        const source = providerTypeSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : resolveStaticProviderPolicy(
              staticCatalog,
              source.identity,
              staticCatalog.relationCatalog.resolveType(source.identity),
            );
      }
      case "value": {
        const source = providerValueSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : resolveStaticProviderPolicy(
              staticCatalog,
              source.identity,
              staticCatalog.relationCatalog.resolveValue(source.identity),
            );
      }
      case "member": {
        const source = providerMemberSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : resolveStaticProviderPolicy(
              staticCatalog,
              source.identity,
              staticCatalog.relationCatalog.resolveMember(source.identity),
            );
      }
      case "signature": {
        const source = providerSignatureSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : resolveStaticProviderPolicy(
              staticCatalog,
              source.identity,
              staticCatalog.relationCatalog.resolveSignature(
                source.identity,
              ),
            );
      }
    }
  };
  return Object.freeze({
    resolveType(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return resolve(declaration, "type");
    },
    resolveValue(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return resolve(declaration, "value");
    },
    resolveMember(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return resolve(declaration, "member");
    },
    resolveSignature(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return resolve(declaration, "signature");
    },
    findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined {
      return findUniqueTargetBinding(
        [
          ...providers.map((provider) =>
            provider.findTargetBindingByTargetId(targetId)),
          ...staticBindings.filter((binding) => binding.id === targetId),
        ],
      );
    },
    findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined {
      return findUniqueTargetBinding(
        [
          ...providers.map((provider) =>
            provider.findTargetBindingByMetadataName(metadataName)),
          ...staticBindings.filter((binding) =>
            binding.targetName === metadataName),
        ],
      );
    },
  });
}

type StaticProviderPolicy = {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly relationCatalog: ReturnType<
    typeof createCsharpProviderRelationCatalog
  >;
  readonly rejectionCatalog: ReturnType<
    typeof createCsharpProviderRejectionCatalog
  >;
};

function resolveStaticProviderPolicy(
  policy: StaticProviderPolicy,
  source: Parameters<StaticProviderPolicy["rejectionCatalog"]["resolve"]>[0],
  relations: readonly CsharpProviderTargetRelation[],
): CsharpProviderRelationResolution {
  const diagnostic = policy.rejectionCatalog.resolve(source);
  return diagnostic === undefined
    ? { kind: "resolved", relations }
    : { kind: "rejected", diagnostic };
}

function uniqueStaticBindings(
  bindings: readonly TargetBindingFact[],
): readonly TargetBindingFact[] {
  const byId = new Map<string, TargetBindingFact>();
  for (const binding of bindings) {
    const existing = byId.get(binding.id);
    if (
      existing !== undefined &&
      JSON.stringify(existing) !== JSON.stringify(binding)
    ) {
      throw new Error(
        `C# provider relation contributions define incompatible target binding '${binding.id}'.`,
      );
    }
    byId.set(binding.id, binding);
  }
  return Object.freeze([...byId.values()]);
}

function assertUniqueProviderSources(
  providers: readonly DotnetReflectionTypeDataProvider[],
  staticCatalogs: readonly {
    readonly providerId: string;
    readonly providerVersion: string;
  }[],
): void {
  const identities = new Set(
    providers.map((provider) =>
      JSON.stringify([provider.identity.id, provider.identity.version])),
  );
  for (const catalog of staticCatalogs) {
    const identity = JSON.stringify([
      catalog.providerId,
      catalog.providerVersion,
    ]);
    if (identities.has(identity)) {
      throw new Error(
        `C# target provider '${catalog.providerId}@${catalog.providerVersion}' is registered more than once.`,
      );
    }
    identities.add(identity);
  }
}

function findUniqueTargetBinding(
  candidates: readonly (TargetBindingFact | undefined)[],
): TargetBindingFact | undefined {
  const bindings = candidates.filter(
    (candidate): candidate is TargetBindingFact => candidate !== undefined,
  );
  if (bindings.length === 0) {
    return undefined;
  }
  const first = bindings[0]!;
  return bindings.every((binding) => binding.id === first.id)
    ? first
    : undefined;
}

function assertUniqueProviderIdentities(
  providers: readonly DotnetReflectionTypeDataProvider[],
): void {
  const identities = new Set<string>();
  for (const provider of providers) {
    const identity = JSON.stringify([
      provider.identity.id,
      provider.identity.version,
    ]);
    if (identities.has(identity)) {
      throw new Error(
        `C# target provider '${provider.identity.id}@${provider.identity.version}' is registered more than once.`,
      );
    }
    identities.add(identity);
  }
}
