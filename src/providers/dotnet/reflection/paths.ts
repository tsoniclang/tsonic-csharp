import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";

export function defaultToolProjectPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tools/dotnet-type-provider/DotnetTypeProvider.csproj");
}

export function defaultToolBuildRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/dotnet-type-provider-tool");
}

export function defaultProviderCacheRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/provider-cache/dotnet-reflection");
}
