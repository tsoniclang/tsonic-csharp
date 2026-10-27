import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider as createProductProvider,
} from "../../dist/public/provider-dotnet.js";

const defaultStorage = Object.freeze({
  toolBuildRoot: fileURLToPath(
    new URL("../../.temp/test-provider-storage/dotnet-tool/", import.meta.url),
  ),
  cacheRoot: fileURLToPath(
    new URL("../../.temp/test-provider-storage/dotnet-cache/", import.meta.url),
  ),
});

export function createDotnetReflectionTypeDataProvider(options = {}) {
  return createProductProvider({
    ...options,
    storage: options.storage ?? defaultStorage,
  });
}

export function dotnetReflectionProviderStorage(overrides = {}) {
  return Object.freeze({
    ...defaultStorage,
    ...overrides,
  });
}
