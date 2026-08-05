import type {
  DotnetProviderIdentity,
} from "../model.js";

export const dotnetReflectionProviderIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-reflection-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET reflection provider",
};

export const dotnetReflectionProviderCacheAbiVersion = "dotnet-reflection-provider-cache-v14";
export const dotnetReflectionSupportedTargetFramework = "net10.0";
