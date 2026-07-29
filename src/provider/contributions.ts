import { fileURLToPath } from "node:url";
import type {
  TargetBackendContext,
  TargetCapabilityContribution,
} from "@tsonic/target-api";
import type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifierPolicy,
} from "../providers/dotnet/module-specifier.js";
import {
  createDotnetModuleSpecifierPolicy,
  normalizeDotnetAssemblySourcePackages,
} from "../providers/dotnet/module-specifier.js";
import type {
  DotnetProviderIdentity,
} from "../providers/dotnet/model.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../providers/dotnet/reflection/provider.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "../providers/dotnet/reflection/provider.js";
import type {
  CsharpProviderTargetRelation,
} from "./target-relations/index.js";

export const csharpDotnetProviderContributionKind = "csharp-dotnet-provider";
export const csharpProviderRelationsContributionKind =
  "csharp-provider-relations";

export interface CsharpDotnetProviderContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpDotnetProviderContributionKind;
  readonly providerIdentity: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly referenceDirectoryUrl: string;
  readonly assemblySourcePackages: readonly DotnetAssemblySourcePackage[];
  readonly targetFramework?: string;
}

export interface CsharpProviderRelationsContribution
  extends TargetCapabilityContribution {
  readonly kind: typeof csharpProviderRelationsContributionKind;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly relations: readonly CsharpProviderTargetRelation[];
}

export interface CollectedCsharpCapabilityContributions {
  readonly dotnetProviders: readonly CsharpDotnetProviderContribution[];
  readonly providerRelations: readonly CsharpProviderRelationsContribution[];
}

export function csharpProviderRelationsContribution(
  providerId: string,
  providerVersion: string,
  relations: readonly CsharpProviderTargetRelation[],
): CsharpProviderRelationsContribution {
  return freezeValue({
    kind: csharpProviderRelationsContributionKind,
    providerId,
    providerVersion,
    relations,
  });
}

export function collectCsharpCapabilityContributions(
  context: TargetBackendContext,
): CollectedCsharpCapabilityContributions {
  const dotnetProviders: CsharpDotnetProviderContribution[] = [];
  const providerRelations: CsharpProviderRelationsContribution[] = [];
  for (const capability of context.selectedCapabilities) {
    const contributions = capability.createTargetContributions?.({
      project: context.project,
      target: context.target,
      targetPack: context.targetPack,
      selectedCapabilities: context.selectedCapabilities,
      selectedSurfaces: context.selectedSurfaces,
      capability,
    }) ?? [];
    if (!Array.isArray(contributions)) {
      throw new Error(
        `C# target capability '${capability.id}' returned a non-array target contribution set.`,
      );
    }
    for (const contribution of contributions) {
      if (contribution.kind === csharpDotnetProviderContributionKind) {
        dotnetProviders.push(validateCsharpDotnetProviderContribution(
          capability.id,
          capability.moduleOwnership,
          contribution,
        ));
      } else if (contribution.kind === csharpProviderRelationsContributionKind) {
        providerRelations.push(validateCsharpProviderRelationsContribution(
          capability.id,
          capability.moduleOwnership,
          contribution,
        ));
      }
    }
  }
  return Object.freeze({
    dotnetProviders: Object.freeze(dotnetProviders),
    providerRelations: Object.freeze(providerRelations),
  });
}

export function createCapabilityDotnetProviders(
  context: TargetBackendContext,
  contributions: CollectedCsharpCapabilityContributions =
    collectCsharpCapabilityContributions(context),
): readonly DotnetReflectionTypeDataProvider[] {
  const providers: DotnetReflectionTypeDataProvider[] = [];
  const identities = new Set<string>();
  for (const contribution of contributions.dotnetProviders) {
    const identity = providerIdentityKey(contribution.providerIdentity);
    if (identities.has(identity)) {
      throw new Error(
        `C# target capability contributions duplicate .NET provider '${contribution.providerIdentity.id}@${contribution.providerIdentity.version}'.`,
      );
    }
    identities.add(identity);
    providers.push(createDotnetReflectionTypeDataProvider({
      providerIdentity: contribution.providerIdentity,
      moduleSpecifierPolicy: contribution.moduleSpecifierPolicy,
      referenceDirectory: fileURLToPath(contribution.referenceDirectoryUrl),
      assemblySourcePackages: contribution.assemblySourcePackages,
      targetFramework: contribution.targetFramework,
    }));
  }
  return Object.freeze(providers);
}

function validateCsharpProviderRelationsContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpProviderRelationsContribution {
  if (
    !isRecord(contribution) ||
    !hasExactFields(contribution, [
      "kind",
      "providerId",
      "providerVersion",
      "relations",
    ]) ||
    !nonEmptyString(contribution.providerId) ||
    !nonEmptyString(contribution.providerVersion) ||
    !Array.isArray(contribution.relations)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid '${csharpProviderRelationsContributionKind}' contribution.`,
    );
  }
  const snapshot = freezeValue(contribution) as unknown as
    CsharpProviderRelationsContribution;
  for (const relation of snapshot.relations) {
    validateCsharpProviderRelation(
      capabilityId,
      moduleOwnership,
      snapshot.providerId,
      snapshot.providerVersion,
      relation,
    );
  }
  return snapshot;
}

function validateCsharpProviderRelation(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  providerId: string,
  providerVersion: string,
  relation: CsharpProviderTargetRelation,
): void {
  if (
    !isRecord(relation) ||
    !["type", "value", "member", "signature"].includes(
      String(relation.kind),
    ) ||
    !isRecord(relation.source) ||
    relation.source.kind !== relation.kind ||
    relation.source.providerId !== providerId ||
    relation.source.providerVersion !== providerVersion ||
    !nonEmptyString(relation.source.providerModuleId) ||
    !nonEmptyString(relation.source.moduleSpecifier) ||
    !nonEmptyString(relation.source.exportId) ||
    !nonEmptyString(relation.source.exportName) ||
    !moduleOwnership.some((ownership) =>
      relation.source.moduleSpecifier.startsWith(ownership.specifierPrefix)) ||
    !isRecord(relation.targetBinding) ||
    relation.targetBinding.target !== "csharp" ||
    !nonEmptyString(relation.targetBinding.id)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid provider relation.`,
    );
  }
  if (
    relation.kind !== "type" &&
    (
      !isRecord(relation.targetMember) ||
      !nonEmptyString(relation.targetMember.id)
    )
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied a provider ${relation.kind} relation without an exact target member.`,
    );
  }
}

function validateCsharpDotnetProviderContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpDotnetProviderContribution {
  if (
    !isRecord(contribution) ||
    !hasExactFields(contribution, [
      "kind",
      "providerIdentity",
      "moduleSpecifierPolicy",
      "referenceDirectoryUrl",
      "assemblySourcePackages",
      "targetFramework",
    ]) ||
    !isDotnetProviderIdentity(contribution.providerIdentity) ||
    !isRecord(contribution.moduleSpecifierPolicy) ||
    !isFileDirectoryUrl(contribution.referenceDirectoryUrl) ||
    !Array.isArray(contribution.assemblySourcePackages) ||
    (contribution.targetFramework !== undefined ||
      Object.prototype.hasOwnProperty.call(contribution, "targetFramework")) &&
      typeof contribution.targetFramework !== "string"
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid '${csharpDotnetProviderContributionKind}' contribution.`,
    );
  }
  const policy = createDotnetModuleSpecifierPolicy(
    String(contribution.moduleSpecifierPolicy.packageName),
  );
  if (
    contribution.moduleSpecifierPolicy.modulePrefix !== policy.modulePrefix ||
    !moduleOwnership.some((ownership) => ownership.specifierPrefix === policy.modulePrefix)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' .NET provider source package '${policy.packageName}' is not owned by the capability module contract.`,
    );
  }
  const assemblySourcePackages = normalizeDotnetAssemblySourcePackages(
    contribution.assemblySourcePackages as readonly DotnetAssemblySourcePackage[],
  );
  if (!assemblySourcePackages.some((entry) => entry.packageName === policy.packageName)) {
    throw new Error(
      `C# target capability '${capabilityId}' .NET provider contribution does not map an assembly to '${policy.packageName}'.`,
    );
  }
  return Object.freeze({
    kind: csharpDotnetProviderContributionKind,
    providerIdentity: Object.freeze({
      ...(contribution.providerIdentity as unknown as DotnetProviderIdentity),
    }),
    moduleSpecifierPolicy: policy,
    referenceDirectoryUrl: new URL(contribution.referenceDirectoryUrl).href,
    assemblySourcePackages,
    ...(contribution.targetFramework === undefined
      ? {}
      : { targetFramework: contribution.targetFramework }),
  });
}

function isDotnetProviderIdentity(value: unknown): value is DotnetProviderIdentity {
  return isRecord(value) &&
    hasExactFields(value, ["id", "version", "target", "displayName"]) &&
    nonEmptyString(value.id) &&
    nonEmptyString(value.version) &&
    value.target === "csharp" &&
    nonEmptyString(value.displayName);
}

function isFileDirectoryUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "file:" && url.pathname.endsWith("/");
}

function providerIdentityKey(identity: DotnetProviderIdentity): string {
  return JSON.stringify([identity.id, identity.version]);
}

function hasExactFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  const allowedFields = new Set(allowed);
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeValue(entry))) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .map(([key, child]) => [key, freezeValue(child)]),
    )) as T;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new Error(
      "C# target contributions must contain immutable data, not executable or symbolic values.",
    );
  }
  return value;
}
