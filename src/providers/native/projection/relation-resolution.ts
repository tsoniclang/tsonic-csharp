import type { ExtensionDiagnostic, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { CsharpTargetBindingFact, TargetBindingFact } from "../../../target-model/types/model.js";
import type { DotnetReflectionTypeDataProvider } from "../acquisition/provider.js";
import { resolveDotnetProviderTargetRelations } from "./target-relation-resolver.js";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { assertCsharpProviderPolicyIsNonContradictory, createCsharpProviderRejectionCatalog, createCsharpProviderRelationCatalog, providerMemberSourceIdentity, providerSignatureSourceIdentity, providerTypeSourceIdentity, providerValueSourceIdentity } from "../../model/provider-relations.js";
import type { CsharpProviderPolicyContribution, CsharpProviderBindingResolution, CsharpProviderBindingLookupPurpose, CsharpProviderNativeBindingResolution } from "../../../target-model/metadata/provider-metadata.js";
import { dotnetExtensionDiagnostic } from "../model/diagnostics.js";
import { dotnetReflectionProviderIdentity } from "../acquisition/provider-identity.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import { csharpBuiltInProviderPolicies } from "../../builtins/source-types.js";
import type { CsharpProviderRelationResolution, CsharpProviderRelationResolver } from "../../model/relation-resolver.js";
import { assertCsharpProviderLookupPurpose } from "../../model/relation-resolver.js";
import type { CsharpProviderRuntimePreparation, CsharpProviderRuntimeAcquisition } from "../../model/relation-resolver.js";
import { csharpNativeTargetBindingFact } from "../../../target-model/types/native-inheritance.js";
import { csharpNativeInheritanceLookup } from "../../../target-model/types/native-inheritance.js";
import { findUniqueTargetBinding, isCsharpProviderTargetBinding } from "../acquisition/target-binding-index.js";
import { createCsharpProviderIdentityPublication } from "./native-identity-publication.js";
import type { CsharpProviderIdentityPublication } from "../../model/relation-resolver.js";
import { csharpSourceErrorTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpSourceErrorNames } from "../../../target-model/identities/source-errors.js";

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
      targetBindings: Object.freeze(policy.relations.map(relation => relation.targetBinding)),
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
    staticCatalogs.flatMap(entry => entry.targetBindings),
  );
  const sourceErrorReferences: readonly CsharpTargetBindingFact[] = csharpSourceErrorNames
    .map(name => csharpSourceErrorTargetType(name)).map<CsharpTargetBindingFact>(type => Object.freeze({
      id: type.id, target: "csharp", kind: "class", sourceName: type.id, targetName: type.id, csharpType: type,
    }));
  const sourceErrorIds = new Set(sourceErrorReferences.map(reference => reference.id));
  const publish = createCsharpProviderIdentityPublication([...sourceErrorReferences, ...staticCatalogs.flatMap(policy =>
    policy.relationCatalog.relations.filter(relation => !policy.targetBindings.some(binding =>
      binding.id === relation.targetBinding.id)).map(relation => relation.targetBinding))], acquireReferencedBinding);
  const publishedBindings = new WeakMap<TargetBindingFact, CsharpProviderBindingResolution>();
  assertUniqueProviderIdentities(providers);
  assertUniqueProviderSources(providers, staticCatalogs);
  const resolutions = new WeakMap<
    ProviderVirtualDeclarationFact,
    Map<CsharpProviderTargetRelation["kind"], CsharpProviderRelationResolution>
  >();
  let runtimePrepared = false;
  const failures = new Map<string, ExtensionDiagnostic>();
  const retained = <Value extends CsharpProviderBindingResolution | CsharpProviderRelationResolution | CsharpProviderRuntimeAcquisition>(result: Value): Value => {
    if (result.kind === "rejected") {
      const diagnostic = result.diagnostic;
      failures.set(canonicalProviderValue(diagnostic), diagnostic);
    }
    return result;
  };
  const inheritance = new Map<string, CsharpProviderNativeBindingResolution>();
  const ordinaryIds = new Map<string, CsharpProviderBindingResolution>();
  const ordinaryMetadata = new Map<string, CsharpProviderBindingResolution>();
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
  function ordinaryQuery(query: string, kind: "id" | "metadata"): CsharpProviderBindingResolution {
    const cache = kind === "id" ? ordinaryIds : ordinaryMetadata;
    const existing = cache.get(query);
    if (existing !== undefined) return existing;
    const result = retained(findUniqueTargetBinding(bindingCandidates(query, kind), query));
    cache.set(query, result);
    return result;
  }
  function acquireReferencedBinding(reference: CsharpTargetBindingFact): CsharpProviderBindingResolution {
    const type = reference.csharpType;
    if (type?.kind !== "target-named") return Object.freeze({ kind: "missing" });
    const lookup = csharpNativeInheritanceLookup(type);
    const selected = lookup.kind === "metadata-name" ? ordinaryQuery(lookup.metadataName, "metadata")
      : ordinaryQuery(lookup.targetId, "id");
    return selected.kind !== "missing" || !sourceErrorIds.has(reference.id) ? selected
      : lookup.kind === "metadata-name" ? inheritanceQuery(lookup.metadataName, "metadata")
      : inheritanceQuery(lookup.targetId, "id");
  }
  function publishBinding(result: CsharpProviderBindingResolution): CsharpProviderBindingResolution {
    if (result.kind !== "resolved") return result;
    const existing = publishedBindings.get(result.binding);
    if (existing !== undefined) return existing;
    const selected = publish(result.binding);
    const published = selected.kind === "resolved" ? Object.freeze({ kind: "resolved" as const, binding: selected.value }) : selected;
    publishedBindings.set(result.binding, published);
    return published;
  }
  function findTargetBindingByTargetId(targetId: string, purpose: "inheritance"): CsharpProviderNativeBindingResolution;
  function findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
  function findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
    assertCsharpProviderLookupPurpose(purpose);
    return retained(purpose === "inheritance" ? inheritanceQuery(targetId, "id")
      : publishBinding(ordinaryQuery(targetId, "id")));
  }
  function findTargetBindingByMetadataName(metadataName: string, purpose: "inheritance"): CsharpProviderNativeBindingResolution;
  function findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
  function findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
    assertCsharpProviderLookupPurpose(purpose);
    return retained(purpose === "inheritance" ? inheritanceQuery(metadataName, "metadata")
      : publishBinding(ordinaryQuery(metadataName, "metadata")));
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
              acquireReferencedBinding,
              publish,
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
              acquireReferencedBinding,
              publish,
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
              acquireReferencedBinding,
              publish,
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
              acquireReferencedBinding,
              publish,
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
    const result = retained(resolve(declaration, kind));
    if (kinds === undefined) {
      kinds = new Map();
      resolutions.set(declaration, kinds);
    }
    kinds.set(kind, result);
    return result;
  };
  return Object.freeze({
    publishNativeIdentities<Value>(value: Value): CsharpProviderIdentityPublication<Value> {
      const result = publish(value);
      if (result.kind === "rejected") retained(result);
      return result;
    },
    failures(): readonly ExtensionDiagnostic[] {
      return Object.freeze([...failures.values()]);
    },
    prepareRuntimeSources(preparation: CsharpProviderRuntimePreparation): CsharpProviderRuntimeAcquisition {
      if (runtimePrepared) throw new TypeError("C# native runtime acquisition inputs are prepared exactly once per analysis.");
      runtimePrepared = true;
      ordinaryIds.clear();
      ordinaryMetadata.clear();
      return retained(providers[0]?.prepareRuntimeSources(preparation) ??
        Object.freeze({ kind: "resolved", references: Object.freeze([]) }));
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
  readonly targetBindings: readonly CsharpTargetBindingFact[];
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
  acquire: (reference: CsharpTargetBindingFact) => CsharpProviderBindingResolution,
  publish: <Value>(value: Value) => CsharpProviderIdentityPublication<Value>,
): CsharpProviderRelationResolution {
  const diagnostic = policy.rejectionCatalog.resolve(source);
  if (diagnostic !== undefined) return { kind: "rejected", diagnostic };
  const resolved: CsharpProviderTargetRelation[] = [];
  for (const relation of relations) {
    const owned = policy.targetBindings.filter(binding => binding.id === relation.targetBinding.id);
    const selected = owned.length === 0 ? acquire(relation.targetBinding)
      : findUniqueTargetBinding([...owned, relation.targetBinding].map(binding =>
        Object.freeze({ kind: "resolved" as const, binding })), relation.targetBinding.id);
    if (selected.kind === "rejected") return selected;
    if (selected.kind === "missing") return { kind: "missing",
      reason: "A source provider relation requires its exact physical binding from the declared native owner." };
    if (!isCsharpProviderTargetBinding(selected.binding)) return { kind: "missing",
      reason: "A source provider relation requires its complete C# native generic parameter permissions." };
    const published = publish(Object.freeze({ ...relation, targetBinding: selected.binding }));
    if (published.kind !== "resolved") return published;
    resolved.push(published.value);
  }
  return { kind: "resolved", relations: Object.freeze(resolved) };
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
