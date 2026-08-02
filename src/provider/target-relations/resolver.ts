import type {
  ExtensionDiagnostic,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../policy/types/index.js";
import type {
  TargetBackendContext,
} from "@tsonic/target-api";
import {
  readCsharpReflectionReferencePaths,
  readCsharpTargetFramework,
} from "../../options/csharp-target-options.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../../providers/dotnet/reflection/provider.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "../../providers/dotnet/reflection/provider.js";
import {
  resolveDotnetProviderTargetRelations,
} from "../../providers/dotnet/target-relation-resolver.js";
import {
  createCapabilityDotnetProviders,
} from "../contributions.js";
import type {
  CsharpProviderTargetRelation,
} from "./index.js";
import {
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
  providerValueSourceIdentity,
} from "./index.js";
import {
  collectCsharpCapabilityContributions,
} from "../contributions.js";

export type CsharpProviderRelationResolution =
  | {
      readonly kind: "resolved";
      readonly relations: readonly CsharpProviderTargetRelation[];
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export interface CsharpProviderRelationResolver {
  resolveType(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveValue(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveMember(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveSignature(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined;
  findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined;
}

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
  const staticCatalogs = contributions.providerRelations.map((contribution) => ({
    providerId: contribution.providerId,
    providerVersion: contribution.providerVersion,
    catalog: createCsharpProviderRelationCatalog([contribution.relations]),
  }));
  const staticBindings = uniqueStaticBindings(
    staticCatalogs.flatMap((entry) =>
      entry.catalog.relations.map((relation) => relation.targetBinding)),
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
          : {
              kind: "resolved",
              relations: staticCatalog.catalog.resolveType(source.identity),
            };
      }
      case "value": {
        const source = providerValueSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : {
              kind: "resolved",
              relations: staticCatalog.catalog.resolveValue(source.identity),
            };
      }
      case "member": {
        const source = providerMemberSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : {
              kind: "resolved",
              relations: staticCatalog.catalog.resolveMember(source.identity),
            };
      }
      case "signature": {
        const source = providerSignatureSourceIdentity(declaration);
        return source.kind === "missing"
          ? source
          : {
              kind: "resolved",
              relations: staticCatalog.catalog.resolveSignature(
                source.identity,
              ),
            };
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
