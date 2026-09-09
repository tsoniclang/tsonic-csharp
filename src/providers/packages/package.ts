import type {
  TargetCapabilityContext,
  TargetCapabilityImplementation,
  TargetSourceCompilerContributions,
} from "@tsonic/target-api/provider";
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
  const contributions = Object.freeze([snapshot.policy]);
  return Object.freeze({
    kind: "target-capability",
    id: snapshot.id,
    targetId: "csharp",
    displayName: snapshot.displayName,
    moduleOwnership,
    sourceCompilerContributions(context: TargetCapabilityContext): TargetSourceCompilerContributions {
      const selectedSurfaceIds = Object.freeze([...context.selectedSurfaceIds]);
      return {
        extensions: [{
          identity: { id: snapshot.providerIdentity.id, version: snapshot.providerIdentity.version },
          initialize(extensionContext) {
            extensionContext.registerSourceDeclarationProvider(
              createCsharpPackageSourceProvider(snapshot, selectedSurfaceIds),
            );
          },
        }],
      };
    },
    createTargetContributions() {
      return contributions;
    },
    runtimeContributions() {
      return snapshot.runtime;
    },
  } satisfies TargetCapabilityImplementation);
}
