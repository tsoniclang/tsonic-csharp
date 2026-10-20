import { sourceSemanticsExtensionId } from "@tsonic/tsts";
import type { CompilerExtension, SourceDeclarationProvider } from "@tsonic/tsts";
import { csharpLangModule, csharpProviderVersion, csharpSourceSemanticsExtensionId, csharpSourceVirtualModulesProviderId } from "../../target-model/identities/source.js";
import { analyzeSafetyBuilderCalls, analyzeUnsafeContextCalls } from "@tsonic/source-core/extension";
import { sourceSafetySignatureIds, tsonicCoreSourceExtensionId } from "@tsonic/source-core/facts";

import { createCsharpSourceVirtualModulesProvider } from "../profiles/source-virtual-modules.js";
import { csharpSafetyBuilderFactKey, csharpSafetyProviderNames, csharpUnsafeContextFactKey } from "./explicit-safety.js";
export function createCsharpSourceSemanticsExtension(
  sourceDeclarationProviders: readonly SourceDeclarationProvider[],
): CompilerExtension {
  return {
    identity: {
      id: csharpSourceSemanticsExtensionId,
      version: csharpProviderVersion,
    },
    dependencies: {
      dependsOn: [sourceSemanticsExtensionId, tsonicCoreSourceExtensionId],
      runsAfter: [sourceSemanticsExtensionId, tsonicCoreSourceExtensionId],
    },
    initialize(extensionContext): void {
      extensionContext.registerSourceDeclarationProvider(createCsharpSourceVirtualModulesProvider());
      for (const sourceDeclarationProvider of sourceDeclarationProviders) {
        extensionContext.registerSourceDeclarationProvider(
          sourceDeclarationProvider,
        );
      }
    },
    analyzeSource(context): void {
      analyzeUnsafeContextCalls(context, {
        blockSelector: {
          kind: "export-signature",
          providerId: csharpSourceVirtualModulesProviderId,
          providerVersion: csharpProviderVersion,
          providerModuleId: csharpLangModule,
          exportId: csharpSafetyProviderNames.unsafeContextExport,
          signatureId: sourceSafetySignatureIds.unsafeContextBlock,
        },
        expressionSelector: {
          kind: "export-signature",
          providerId: csharpSourceVirtualModulesProviderId,
          providerVersion: csharpProviderVersion,
          providerModuleId: csharpLangModule,
          exportId: csharpSafetyProviderNames.unsafeContextExport,
          signatureId: sourceSafetySignatureIds.unsafeContextExpression,
        },
        factKey: csharpUnsafeContextFactKey,
        extensionId: csharpSourceSemanticsExtensionId,
        invalidPositionCode: "CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID",
        invalidPositionNumber: 9100171,
        factWriteCode: "CSHARP_UNSAFE_CONTEXT_FACT_WRITE_FAILED",
        factWriteNumber: 9100172,
      });
      analyzeSafetyBuilderCalls(context, {
        providerId: csharpSourceVirtualModulesProviderId,
        providerVersion: csharpProviderVersion,
        providerModuleId: csharpLangModule,
        names: csharpSafetyProviderNames,
        factKey: csharpSafetyBuilderFactKey,
        extensionId: csharpSourceSemanticsExtensionId,
        diagnosticPrefix: "CSHARP_SAFETY",
        diagnosticNumberBase: 9100180,
      });
    },
  };
}
