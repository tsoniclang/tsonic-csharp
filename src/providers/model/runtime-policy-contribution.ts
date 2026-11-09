import type { TargetCapabilityContribution } from "@tsonic/target-api/provider";
import type { CsharpRuntimeProviderPolicyContribution } from "./runtime-policy.js";
import type { CsharpRuntimeProjectSource } from "../../target-model/project/runtime.js";
import { hasExactContributionFields, isContributionRecord, nonEmptyContributionString } from "./contribution-values.js";
import { validateCsharpProviderPolicyContribution } from "./provider-policy-contribution.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";

export function validateCsharpRuntimeProviderPolicyContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpRuntimeProviderPolicyContribution {
  if (!isRuntimeContribution(contribution)) {
    throw new TypeError(`C# capability '${capabilityId}' supplied an invalid runtime-project provider policy.`);
  }
  const policy = contribution.policy;
  return Object.freeze({ kind: "csharp-runtime-provider-policy", providerId: contribution.providerId,
    providerVersion: contribution.providerVersion, selectedSurfaceIds: Object.freeze([...contribution.selectedSurfaceIds]),
    policy: Object.freeze({ kind: "runtime-project", nativeDomain: policy.nativeDomain,
      create(input: Parameters<CsharpRuntimeProviderPolicyContribution["policy"]["create"]>[0]) {
      const selected = validateCsharpProviderPolicyContribution(capabilityId, moduleOwnership, policy.create(input));
      if (selected.providerId !== contribution.providerId || selected.providerVersion !== contribution.providerVersion) {
        throw new TypeError("A runtime-project policy must retain its original provider identity and version.");
      }
      return selected;
    } }) });
}

function isRuntimeContribution(value: unknown): value is CsharpRuntimeProviderPolicyContribution {
  if (!isContributionRecord(value) || !hasExactContributionFields(value,
    ["kind", "providerId", "providerVersion", "selectedSurfaceIds", "policy"]) ||
    value.kind !== "csharp-runtime-provider-policy" || !nonEmptyContributionString(value.providerId) ||
    !nonEmptyContributionString(value.providerVersion) || !Array.isArray(value.selectedSurfaceIds) ||
    value.selectedSurfaceIds.some(surface => !nonEmptyContributionString(surface)) ||
    new Set(value.selectedSurfaceIds).size !== value.selectedSurfaceIds.length) return false;
  const policy = value.policy;
  if (!isContributionRecord(policy) || !hasExactContributionFields(policy, ["kind", "nativeDomain", "create"]) ||
    policy.kind !== "runtime-project" || typeof policy.create !== "function") return false;
  const domain = policy.nativeDomain;
  return isContributionRecord(domain) && hasExactContributionFields(domain, ["source", "namespaces"]) &&
    Array.isArray(domain.namespaces) && domain.namespaces.length !== 0 &&
    domain.namespaces.every(namespace => nonEmptyContributionString(namespace)) &&
    new Set(domain.namespaces).size === domain.namespaces.length && isRuntimeSource(domain.source);
}

function isRuntimeSource(value: unknown): value is CsharpRuntimeProjectSource {
  const pending = [value];
  const visited = new Set<object>();
  const budget = createCsharpMetadataBudget();
  while (pending.length !== 0) {
    const source = pending.pop();
    if (!isContributionRecord(source) || !hasExactContributionFields(source, ["projectPath", "propertiesPath", "dependencies"]) ||
      !nonEmptyContributionString(source.projectPath) || !nonEmptyContributionString(source.propertiesPath)) return false;
    if (visited.has(source)) continue;
    budget.reserve(1);
    visited.add(source);
    if (source.dependencies === undefined) continue;
    if (!isContributionRecord(source.dependencies)) return false;
    for (const [name, dependency] of Object.entries(source.dependencies)) {
      if (!nonEmptyContributionString(name)) return false;
      pending.push(dependency);
    }
  }
  return true;
}
