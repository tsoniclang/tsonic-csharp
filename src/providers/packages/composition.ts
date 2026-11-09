import type { TargetCapabilityContext, TargetCapabilityImplementation, TargetSourceCompilerContributions } from "@tsonic/target-api/provider";
import type { CsharpProviderPackageDefinition } from "./model.js";
import { createCsharpPackageSourceProvider } from "./source-provider.js";
import { snapshotCsharpProviderPackage } from "./validation.js";

export function createCsharpProviderPackage(
  definition: CsharpProviderPackageDefinition,
): TargetCapabilityImplementation {
  const snapshot = snapshotCsharpProviderPackage(definition);
  const moduleOwnership = Object.freeze(snapshot.moduleSpecifiers.map((entry) => Object.freeze({
    specifierPrefix: entry.moduleSpecifier,
    ...(entry.message === undefined ? {} : { message: entry.message }),
  })));
  return Object.freeze({
    kind: "target-capability",
    id: snapshot.id,
    targetId: "csharp",
    displayName: snapshot.displayName,
    moduleOwnership,
    sourceCompilerContributions(context: TargetCapabilityContext): TargetSourceCompilerContributions {
      const selectedSurfaceIds = Object.freeze([...context.selectedSurfaceIds]);
      return Object.freeze({ declarationProviders: Object.freeze([
        createCsharpPackageSourceProvider(snapshot, selectedSurfaceIds),
      ]) });
    },
    createTargetContributions(context) {
      if (snapshot.policy.kind === "static") return Object.freeze([snapshot.policy.create(context.selectedSurfaceIds)]);
      return Object.freeze([Object.freeze({ kind: "csharp-runtime-provider-policy",
        providerId: snapshot.providerIdentity.id, providerVersion: snapshot.providerIdentity.version,
        selectedSurfaceIds: Object.freeze([...context.selectedSurfaceIds]), policy: snapshot.policy })]);
    },
    runtimeContributions() {
      return snapshot.runtime;
    },
  } satisfies TargetCapabilityImplementation);
}
