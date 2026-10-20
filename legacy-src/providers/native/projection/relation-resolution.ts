import type {
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../../target-model/types/model.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "../acquisition/provider.js";
import {
  resolveDotnetProviderTargetRelations,
} from "./target-relation-resolver.js";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import {
  assertCsharpProviderPolicyIsNonContradictory,
  createCsharpProviderRejectionCatalog,
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
  providerValueSourceIdentity,
} from "../../model/provider-relations.js";
import type {
  CsharpProviderPolicyContribution,
  CsharpProviderBindingResolution,
  CsharpProviderBindingLookupPurpose,
  CsharpProviderNativeBindingResolution,
} from "../../../target-model/metadata/provider-metadata.js";
import { dotnetExtensionDiagnostic } from "../model/diagnostics.js";
import { dotnetReflectionProviderIdentity } from "../acquisition/provider-identity.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import {
  csharpBuiltInProviderPolicies,
} from "../../builtins/source-semantic-relations.js";
import type {
  CsharpProviderRelationResolution,
  CsharpProviderRelationResolver,
} from "../../model/relation-resolver.js";
import { assertCsharpProviderLookupPurpose } from "../../model/relation-resolver.js";
import type { CsharpProviderRuntimePreparation } from "../../model/relation-resolver.js";
import { csharpNativeTargetBindingFact } from "../../../target-model/types/native-inheritance.js";
import { findUniqueTargetBinding } from "../acquisition/target-binding-index.js";

export interface CsharpProviderRelationResolverInputs {
  readonly providers: readonly DotnetReflectionTypeDataProvider[];
  readonly providerPolicies: readonly CsharpProviderPolicyContribution[];
}

export function createCsharpProviderRelationResolver(
  inputs: CsharpProviderRelationResolverInputs,
): CsharpProviderRelationResolver {
  const providers = Object.freeze([...inputs.providers]);
  const staticCatalogs = [
    ...csharpBuiltInProviderPolicies().map((policy) => ({
      ...policy,
      targetBindings: [],
      rejections: [],
    })),
    ...inputs.providerPolicies,
  ].map((contribution) => ({
    providerId: contribution.providerId,
    providerVersion: contribution.providerVersion,
    targetBindings: contribution.targetBindings,
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
    staticCatalogs.flatMap((entry) => [
      ...entry.targetBindings,
      ...entry.relationCatalog.relations.map((relation) => relation.targetBinding),
    ]),
  );
  assertUniqueProviderIdentities(providers);
  assertUniqueProviderSources(providers, staticCatalogs);
  const resolutions = new WeakMap<
    ProviderVirtualDeclarationFact,
    Map<CsharpProviderTargetRelation["kind"], CsharpProviderRelationResolution>
  >();
  let runtimePrepared = false;
  const inheritance = new Map<string, CsharpProviderNativeBindingResolution>();
  const acquiring = new Set<string>();
  const bindingCandidates = (
    query: string,
    kind: "id" | "metadata",
  ): readonly CsharpProviderBindingResolution[] => [
      ...providers.map(provider => kind === "id"
        ? provider.findTargetBindingByTargetId(query, "ordinary")
        : provider.findTargetBindingByMetadataName(query, "ordinary")),
      ...staticBindings.filter(binding => kind === "id" ? binding.id === query : binding.targetName === query)
        .map<CsharpProviderBindingResolution>(binding => Object.freeze({ kind: "resolved", binding })),
  ];
  const inheritanceQuery = (
    query: string,
    kind: "id" | "metadata",
  ): CsharpProviderNativeBindingResolution => {
    const key = JSON.stringify([kind, query]);
    const existing = inheritance.get(key);
    if (existing !== undefined) return existing;
    const eligible = bindingCandidates(query, kind).filter(candidate =>
      candidate.kind !== "resolved" || csharpNativeTargetBindingFact(candidate.binding) !== undefined);
    let result = findUniqueTargetBinding(eligible, query);
    if (result.kind !== "resolved" && providers[0] !== undefined) {
      const runtime = kind === "id" ? providers[0].findTargetBindingByTargetId(query, "inheritance")
        : providers[0].findTargetBindingByMetadataName(query, "inheritance");
      result = findUniqueTargetBinding([...eligible, runtime], query);
    }
    if (result.kind !== "resolved") return result.kind === "rejected" ? result : Object.freeze({
      kind: "rejected", diagnostic: dotnetExtensionDiagnostic(dotnetReflectionProviderIdentity.id,
        "DOTNET_REFLECTION_NATIVE_INHERITANCE_NOT_PROVEN", 9200000,
        "The retained native inheritance demand requires complete metadata from its actual referenced assembly.", [{ query }]),
    });
    const native = csharpNativeTargetBindingFact(result.binding);
    if (native === undefined || acquiring.has(key)) return Object.freeze({
      kind: "rejected", diagnostic: dotnetExtensionDiagnostic(dotnetReflectionProviderIdentity.id,
        "DOTNET_REFLECTION_NATIVE_INHERITANCE_INCOMPLETE", 9200000,
        "Native inheritance must publish one complete acyclic class inventory before sealing.", [{ query }]),
    });
    acquiring.add(key);
    try {
      for (const entry of native.csharpInheritance) {
        if (entry.targetId === native.id) continue;
        const base = inheritanceQuery(entry.targetId, "id");
        if (base.kind !== "resolved") return base;
      }
      const completed = Object.freeze({ kind: "resolved" as const, binding: native });
      inheritance.set(key, completed);
      return completed;
    } finally {
      acquiring.delete(key);
    }
  };
  function findTargetBindingByTargetId(targetId: string, purpose: "inheritance"): CsharpProviderNativeBindingResolution;
  function findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
  function findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
    assertCsharpProviderLookupPurpose(purpose);
    return purpose === "inheritance" ? inheritanceQuery(targetId, "id")
      : findUniqueTargetBinding(bindingCandidates(targetId, "id"), targetId);
  }
  function findTargetBindingByMetadataName(metadataName: string, purpose: "inheritance"): CsharpProviderNativeBindingResolution;
  function findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
  function findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
    assertCsharpProviderLookupPurpose(purpose);
    return purpose === "inheritance" ? inheritanceQuery(metadataName, "metadata")
      : findUniqueTargetBinding(bindingCandidates(metadataName, "metadata"), metadataName);
  }
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
  const selected = (
    declaration: ProviderVirtualDeclarationFact | undefined,
    kind: CsharpProviderTargetRelation["kind"],
  ): CsharpProviderRelationResolution => {
    if (declaration === undefined) return resolve(declaration, kind);
    let kinds = resolutions.get(declaration);
    const existing = kinds?.get(kind);
    if (existing !== undefined) return existing;
    const result = resolve(declaration, kind);
    if (kinds === undefined) {
      kinds = new Map();
      resolutions.set(declaration, kinds);
    }
    kinds.set(kind, result);
    return result;
  };
  return Object.freeze({
    prepareRuntimeSources(preparation: CsharpProviderRuntimePreparation): void {
      if (runtimePrepared) throw new TypeError("C# native runtime acquisition inputs are prepared exactly once per analysis.");
      providers[0]?.prepareRuntimeSources(preparation);
      runtimePrepared = true;
    },
    validateReferences() {
      return Object.freeze(providers.flatMap((provider) => {
        const diagnostic = provider.validateReferences();
        return diagnostic === undefined ? [] : [diagnostic];
      }));
    },
    resolveType(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return selected(declaration, "type");
    },
    resolveValue(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return selected(declaration, "value");
    },
    resolveMember(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return selected(declaration, "member");
    },
    resolveSignature(
      declaration: ProviderVirtualDeclarationFact | undefined,
    ): CsharpProviderRelationResolution {
      return selected(declaration, "signature");
    },
    findTargetBindingByTargetId,
    findTargetBindingByMetadataName,
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
  const byValue = new Map<string, TargetBindingFact>();
  for (const binding of bindings) {
    byValue.set(canonicalProviderValue(binding), binding);
  }
  return Object.freeze([...byValue.values()]);
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
