import {
  freezeContributionValue,
  nonEmptyContributionString,
} from "../model/contribution-values.js";
import {
  csharpProviderPolicyContributionKind,
  validateCsharpProviderPolicyContribution,
} from "../model/provider-policy-contribution.js";
import type { CsharpProviderPackageDefinition } from "./model.js";

export function snapshotCsharpProviderPackage(
  definition: CsharpProviderPackageDefinition,
): CsharpProviderPackageDefinition {
  const fail = (message: string): never => {
    throw new Error(`C# provider package '${definition.id}': ${message}`);
  };
  const modules = Object.freeze(definition.modules.map((module) => Object.freeze({
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.providerModuleId,
    getExports: module.getExports,
  })));
  const moduleSpecifiers = freezeContributionValue(definition.moduleSpecifiers);
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
  const providerIdentity = freezeContributionValue(definition.providerIdentity);
  if (
    definition.policy.kind !== csharpProviderPolicyContributionKind ||
    definition.policy.providerId !== providerIdentity.id ||
    definition.policy.providerVersion !== providerIdentity.version
  ) {
    fail("policy contribution must match the source provider identity and version.");
  }
  const policy = validateCsharpProviderPolicyContribution(
    definition.id,
    moduleSpecifiers.map((entry) => ({ specifierPrefix: entry.moduleSpecifier })),
    definition.policy,
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
      : { resolutionEvidence: freezeContributionValue(definition.resolutionEvidence) }),
    ...(definition.declarationEvidence === undefined
      ? {}
      : { declarationEvidence: freezeContributionValue(definition.declarationEvidence) }),
    policy,
    runtime: freezeContributionValue(definition.runtime),
  });
}
