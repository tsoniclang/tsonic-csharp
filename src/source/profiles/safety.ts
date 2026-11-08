import type { TargetSourceSafetyProvider } from "@tsonic/target-api";
import { csharpLangModule, csharpProviderVersion, csharpSourceVirtualModulesProviderId } from "../../target-model/identities/source.js";

export const csharpSourceSafetyProvider: TargetSourceSafetyProvider = Object.freeze({
  providerId: csharpSourceVirtualModulesProviderId,
  providerVersion: csharpProviderVersion,
  providerModuleId: csharpLangModule,
  names: Object.freeze({
    moduleSpecifier: csharpLangModule,
    unsafeContextExport: "unsafe",
    safetyExport: "safety",
    safetyBuilderExport: "__TsonicCsharpSafetyBuilder",
    safetyMemberBuilderExport: "__TsonicCsharpSafetyMemberBuilder",
  }),
});

export const csharpNativePointerExport = "ptr";
