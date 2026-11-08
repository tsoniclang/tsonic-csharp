import { sourceSemanticsExtensionId } from "@tsonic/tsts";
import type { SourceDeclarationProvider } from "@tsonic/tsts";
import type { TargetProviderSourceCallSelector, TargetSourceExtensionContribution } from "@tsonic/target-api";
import { csharpLangModule, csharpProviderVersion, csharpSourceSemanticsExtensionId, csharpSourceVirtualModulesProviderId } from "../../target-model/identities/source.js";
import { sourceSafetySignatureIds, tsonicCoreSourceExtensionId } from "@tsonic/source-core/facts";

import { createCsharpSourceVirtualModulesProvider } from "../profiles/source-virtual-modules.js";
import { csharpSafetyBuilderFactKey, csharpSafetyProviderNames, csharpUnsafeContextFactKey } from "./explicit-safety.js";

/**
 * The C# source extension as the data contribution the Host composes (K-2682): the `@tsonic/csharp/lang.js` and
 * `types.js` virtual modules plus the native declaration providers, and the two provider-call analyses (unsafe context,
 * safety builders) that the Host runs under this extension's identity.
 */
export function createCsharpSourceSemanticsExtension(
  sourceDeclarationProviders: readonly SourceDeclarationProvider[],
): TargetSourceExtensionContribution {
  const selector = (signatureId: string): TargetProviderSourceCallSelector => ({
    kind: "export-signature",
    providerId: csharpSourceVirtualModulesProviderId,
    providerVersion: csharpProviderVersion,
    providerModuleId: csharpLangModule,
    exportId: csharpSafetyProviderNames.unsafeContextExport,
    signatureId,
  });
  return Object.freeze({
    identity: { id: csharpSourceSemanticsExtensionId, version: csharpProviderVersion },
    dependsOn: Object.freeze([sourceSemanticsExtensionId, tsonicCoreSourceExtensionId]),
    declarationProviders: Object.freeze([createCsharpSourceVirtualModulesProvider(), ...sourceDeclarationProviders]),
    providerCallAnalyses: Object.freeze([
      {
        kind: "unsafe-context",
        blockSelector: selector(sourceSafetySignatureIds.unsafeContextBlock),
        expressionSelector: selector(sourceSafetySignatureIds.unsafeContextExpression),
        factKey: csharpUnsafeContextFactKey,
        invalidPositionCode: "CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID",
        invalidPositionNumber: 9100171,
        factWriteCode: "CSHARP_UNSAFE_CONTEXT_FACT_WRITE_FAILED",
        factWriteNumber: 9100172,
      },
      {
        kind: "safety-builder",
        providerId: csharpSourceVirtualModulesProviderId,
        providerVersion: csharpProviderVersion,
        providerModuleId: csharpLangModule,
        names: csharpSafetyProviderNames,
        factKey: csharpSafetyBuilderFactKey,
        diagnosticPrefix: "CSHARP_SAFETY",
        diagnosticNumberBase: 9100180,
      },
    ] as const),
  });
}
