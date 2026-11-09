import { hasExactContributionFields, isContributionRecord, nonEmptyContributionString } from "../model/contribution-values.js";
import { snapshotCsharpMetadata } from "../../target-model/metadata/immutable.js";
import { validateCsharpProviderPolicyContribution } from "../model/provider-policy-contribution.js";
import { csharpProviderPolicyContributionKind, type CsharpProviderPolicyContribution } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpProviderPackageDefinition } from "./model.js";
import type { CsharpAcquiredRuntimeProviderNativeDomain, CsharpProviderPackagePolicy,
  CsharpRuntimeProviderNativeDomain } from "../model/runtime-policy.js";

export function snapshotCsharpProviderPackage(
  definition: CsharpProviderPackageDefinition,
): CsharpProviderPackageDefinition {
  const fail = (message: string): never => {
    throw new Error(`C# provider package '${definition.id}': ${message}`);
  };
  if (Object.hasOwn(definition, "createPolicy")) fail("the removed createPolicy field is not a provider policy; supply policy.kind and policy.create.");
  const modules = Object.freeze(definition.modules.map((module) => Object.freeze({
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.providerModuleId,
    getExports: module.getExports,
  })));
  const moduleSpecifiers = snapshotCsharpMetadata(definition.moduleSpecifiers);
  const modulesBySpecifier = new Map(modules.map((module) => [module.moduleSpecifier, module]));
  const moduleIds = new Set(modules.map((module) => module.providerModuleId));
  if (modulesBySpecifier.size !== modules.length || moduleIds.size !== modules.length) {
    fail("duplicate canonical module specifier or provider module identity.");
  }
  for (const module of modules) {
    if (
      !nonEmptyContributionString(module.moduleSpecifier) ||
      !nonEmptyContributionString(module.providerModuleId) ||
      typeof module.getExports !== "function"
    ) {
      fail("modules require a specifier, provider module identity and export callback.");
    }
  }
  const canonicalBySpecifier = new Map<string, string>();
  for (const entry of moduleSpecifiers) {
    if (!nonEmptyContributionString(entry.moduleSpecifier)) {
      fail("public module specifiers must be nonempty.");
    }
    if (canonicalBySpecifier.has(entry.moduleSpecifier)) {
      fail(`duplicate public module specifier '${entry.moduleSpecifier}'.`);
    }
    if (!modulesBySpecifier.has(entry.canonicalModuleSpecifier)) {
      fail(`public module '${entry.moduleSpecifier}' names an unregistered canonical module.`);
    }
    canonicalBySpecifier.set(entry.moduleSpecifier, entry.canonicalModuleSpecifier);
  }
  for (const module of modules) {
    if (canonicalBySpecifier.get(module.moduleSpecifier) !== module.moduleSpecifier) {
      fail(`canonical module '${module.moduleSpecifier}' requires its own public specifier.`);
    }
  }
  if (
    typeof definition.virtualDeclarationFileName !== "function" ||
    typeof definition.moduleDiagnostic !== "function"
  ) {
    fail("virtual declaration filename and module diagnostic callbacks are required.");
  }
  const providerIdentity = snapshotCsharpMetadata(definition.providerIdentity);
  const packageId = definition.id;
  const inputPolicy = definition.policy;
  if (!isContributionRecord(inputPolicy) || typeof inputPolicy.create !== "function" ||
    inputPolicy.kind !== "static" && inputPolicy.kind !== "runtime-project" ||
    !hasExactContributionFields(inputPolicy, inputPolicy.kind === "static" ? ["kind", "create"] : ["kind", "nativeDomain", "create"])) {
    fail("policy callbacks require an exact static or runtime-project policy.");
  }
  function validate(contribution: CsharpProviderPolicyContribution): CsharpProviderPolicyContribution {
    if (contribution.kind !== csharpProviderPolicyContributionKind ||
      contribution.providerId !== providerIdentity.id || contribution.providerVersion !== providerIdentity.version) {
      fail("policy contribution must match the source provider identity and version.");
    }
    const policy = validateCsharpProviderPolicyContribution(
      packageId,
      moduleSpecifiers.map(entry => ({ specifierPrefix: entry.moduleSpecifier })),
      contribution,
    );
    for (const entries of [policy.relations, policy.rejections]) {
      for (const { source } of entries) {
        const canonicalSpecifier = canonicalBySpecifier.get(source.moduleSpecifier);
        const module = canonicalSpecifier === undefined ? undefined : modulesBySpecifier.get(canonicalSpecifier);
        if (module?.providerModuleId !== source.providerModuleId) {
          fail(`policy source '${source.moduleSpecifier}' does not match a registered provider module identity.`);
        }
      }
    }
    return policy;
  }
  let policy: CsharpProviderPackagePolicy;
  if (inputPolicy.kind === "static") {
    const create = inputPolicy.create;
    const policies = new Map<string, CsharpProviderPolicyContribution>();
    policy = Object.freeze({ kind: "static", create(selectedSurfaceIds: readonly string[]) {
      const surfaces = Object.freeze([...selectedSurfaceIds]);
      const key = JSON.stringify(surfaces);
      const existing = policies.get(key);
      if (existing !== undefined) return existing;
      const selected = validate(create(surfaces));
      policies.set(key, selected);
      return selected;
    } });
  } else {
    const domain = inputPolicy.nativeDomain;
    if (!isContributionRecord(domain) || !hasExactContributionFields(domain, ["source", "namespaces"]) ||
      !isContributionRecord(domain.source) || !Array.isArray(domain.namespaces) || domain.namespaces.length === 0 ||
      domain.namespaces.some(namespace => !nonEmptyContributionString(namespace)) ||
      new Set(domain.namespaces).size !== domain.namespaces.length) fail("runtime-project policy requires a complete runtime source and nonempty unique namespace domain.");
    const nativeDomain: CsharpRuntimeProviderNativeDomain = snapshotCsharpMetadata(domain);
    const create = inputPolicy.create;
    const policies = new WeakMap<CsharpAcquiredRuntimeProviderNativeDomain, Map<string, CsharpProviderPolicyContribution>>();
    policy = Object.freeze({ kind: "runtime-project", nativeDomain, create(input: {
      readonly selectedSurfaceIds: readonly string[]; readonly domain: CsharpAcquiredRuntimeProviderNativeDomain;
    }) {
      if (input.domain.input !== nativeDomain) throw new TypeError("A runtime policy requires its identical acquired runtime domain and selected image.");
      const surfaces = Object.freeze([...input.selectedSurfaceIds]);
      const key = JSON.stringify(surfaces);
      const cached = policies.get(input.domain);
      const existing = cached?.get(key);
      if (existing !== undefined) return existing;
      const selected = validate(create(Object.freeze({ selectedSurfaceIds: surfaces, domain: input.domain })));
      const entries = cached ?? new Map<string, CsharpProviderPolicyContribution>();
      entries.set(key, selected);
      policies.set(input.domain, entries);
      return selected;
    } });
  }
  return Object.freeze({
    id: definition.id,
    displayName: definition.displayName,
    providerIdentity,
    modules,
    moduleSpecifiers,
    virtualDeclarationFileName: definition.virtualDeclarationFileName,
    moduleDiagnostic: definition.moduleDiagnostic,
    ...(definition.resolutionEvidence === undefined
      ? {}
      : { resolutionEvidence: snapshotCsharpMetadata(definition.resolutionEvidence) }),
    ...(definition.declarationEvidence === undefined
      ? {}
      : { declarationEvidence: snapshotCsharpMetadata(definition.declarationEvidence) }),
    policy,
    runtime: snapshotCsharpMetadata(definition.runtime),
  });
}
