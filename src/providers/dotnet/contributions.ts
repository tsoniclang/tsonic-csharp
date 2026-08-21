import { fileURLToPath } from "node:url";
import type {
  TargetCapabilityContribution,
  SelectedTargetCapabilityContributions,
} from "@tsonic/target-api/provider";
import type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifierPolicy,
} from "./modules/specifier.js";
import {
  createDotnetModuleSpecifierPolicy,
  normalizeDotnetAssemblySourcePackages,
} from "./modules/specifier.js";
import type { DotnetProviderIdentity } from "./model/index.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "./reflection/provider.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "./reflection/provider.js";
import {
  csharpProviderPolicyContributionKind,
  validateCsharpProviderPolicyContribution,
} from "../model/provider-policy-contribution.js";
import type {
  CsharpProviderPolicyContribution,
} from "../model/provider-policy-contribution.js";
import {
  hasExactContributionFields,
  isContributionRecord,
  nonEmptyContributionString,
} from "../model/contribution-values.js";

export const csharpDotnetProviderContributionKind = "csharp-dotnet-provider";

export interface CsharpDotnetProviderContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpDotnetProviderContributionKind;
  readonly providerIdentity: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly referenceDirectoryUrl: string;
  readonly assemblySourcePackages: readonly DotnetAssemblySourcePackage[];
  readonly targetFramework?: string;
}

export interface CollectedCsharpCapabilityContributions {
  readonly dotnetProviders: readonly CsharpDotnetProviderContribution[];
  readonly providerPolicies: readonly CsharpProviderPolicyContribution[];
}

export interface CsharpCapabilityDotnetProvider {
  readonly provider: DotnetReflectionTypeDataProvider;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly targetFramework?: string;
}

export function collectCsharpCapabilityContributions(
  capabilities: readonly SelectedTargetCapabilityContributions[],
): CollectedCsharpCapabilityContributions {
  const dotnetProviders: CsharpDotnetProviderContribution[] = [];
  const providerPolicies: CsharpProviderPolicyContribution[] = [];
  for (const capability of capabilities) {
    for (const contribution of capability.contributions) {
      if (contribution.kind === csharpDotnetProviderContributionKind) {
        dotnetProviders.push(validateCsharpDotnetProviderContribution(
          capability.capabilityId,
          capability.moduleOwnership,
          contribution,
        ));
      } else if (contribution.kind === csharpProviderPolicyContributionKind) {
        providerPolicies.push(validateCsharpProviderPolicyContribution(
          capability.capabilityId,
          capability.moduleOwnership,
          contribution,
        ));
      } else {
        throw new Error(
          `C# target capability '${capability.capabilityId}' supplied unsupported target contribution kind '${contribution.kind}'.`,
        );
      }
    }
  }
  return Object.freeze({
    dotnetProviders: Object.freeze(dotnetProviders),
    providerPolicies: Object.freeze(providerPolicies),
  });
}

export function createCapabilityDotnetProviders(
  contributions: CollectedCsharpCapabilityContributions,
): readonly CsharpCapabilityDotnetProvider[] {
  const providers: CsharpCapabilityDotnetProvider[] = [];
  const identities = new Set<string>();
  for (const contribution of contributions.dotnetProviders) {
    const identity = JSON.stringify([
      contribution.providerIdentity.id,
      contribution.providerIdentity.version,
    ]);
    if (identities.has(identity)) {
      throw new Error(
        `C# target capability contributions duplicate .NET provider '${contribution.providerIdentity.id}@${contribution.providerIdentity.version}'.`,
      );
    }
    identities.add(identity);
    providers.push(Object.freeze({
      provider: createDotnetReflectionTypeDataProvider({
        providerIdentity: contribution.providerIdentity,
        moduleSpecifierPolicy: contribution.moduleSpecifierPolicy,
        referenceDirectory: fileURLToPath(contribution.referenceDirectoryUrl),
        assemblySourcePackages: contribution.assemblySourcePackages,
        targetFramework: contribution.targetFramework,
      }),
      moduleSpecifierPolicy: contribution.moduleSpecifierPolicy,
      ...(contribution.targetFramework === undefined
        ? {}
        : { targetFramework: contribution.targetFramework }),
    }));
  }
  return Object.freeze(providers);
}

function validateCsharpDotnetProviderContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpDotnetProviderContribution {
  if (
    !isContributionRecord(contribution) ||
    !hasExactContributionFields(contribution, [
      "kind",
      "providerIdentity",
      "moduleSpecifierPolicy",
      "referenceDirectoryUrl",
      "assemblySourcePackages",
      "targetFramework",
    ]) ||
    !isDotnetProviderIdentity(contribution.providerIdentity) ||
    !isContributionRecord(contribution.moduleSpecifierPolicy) ||
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
  return isContributionRecord(value) &&
    hasExactContributionFields(value, ["id", "version", "target", "displayName"]) &&
    nonEmptyContributionString(value.id) &&
    nonEmptyContributionString(value.version) &&
    value.target === "csharp" &&
    nonEmptyContributionString(value.displayName);
}

function isFileDirectoryUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "file:" && url.pathname.endsWith("/");
}
