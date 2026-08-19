import type {
  DotnetModuleModel,
} from "../model/index.js";
import type {
  DotnetProviderDiagnostic,
} from "../provider.js";
import type {
  DotnetProviderCacheRequest,
} from "./cache.js";
import {
  diagnostic,
} from "./diagnostics.js";

export function validateModuleSatisfiesRequest(
  module: DotnetModuleModel,
  request: DotnetProviderCacheRequest,
): DotnetProviderDiagnostic | undefined {
  const missingExports = missingRequestedExports(module, request.requestedExports);
  const missingTargetIds = missingRequestedTargetIds(module, request.requestedTargetIds);
  const missingMetadataNames = missingRequestedMetadataNames(module, request.requestedMetadataNames);
  const missingMaterializedExports = missingRequestedMaterializedExports(module, request);
  if (missingExports.length === 0 && missingTargetIds.length === 0 && missingMetadataNames.length === 0 && missingMaterializedExports.length === 0) {
    return undefined;
  }
  return diagnostic("DOTNET_REFLECTION_REQUESTED_DECLARATION_MISSING", ".NET reflection provider did not prove all requested declarations.", {
    specifier: request.moduleSpecifier,
    missingExports,
    missingTargetIds,
    missingMetadataNames,
    missingMaterializedExports,
  });
}

function missingRequestedMaterializedExports(
  module: DotnetModuleModel,
  request: DotnetProviderCacheRequest,
): readonly Readonly<{ readonly exportName: string; readonly exportId?: string }>[] {
  if (request.materialization.kind === "complete") {
    return [];
  }
  const declarations = module.exports.filter((declaration) => declaration.kind === "type");
  return request.materialization.completeExports.filter((requested) =>
    requested.exportId === undefined
      ? !declarations.some((declaration) =>
        declaration.sourceName === requested.exportName ||
        declaration.sourceTypeFamily?.exportName === requested.exportName)
      : !declarations.some((declaration) => declaration.targetId === requested.exportId)
  );
}

function missingRequestedExports(
  module: DotnetModuleModel,
  requestedExports: readonly string[] | undefined,
): readonly string[] {
  if (requestedExports === undefined) {
    return [];
  }
  const exports = new Set(module.exports.flatMap((declaration) =>
    declaration.kind === "type" && declaration.sourceTypeFamily !== undefined
      ? declaration.sourceName === declaration.sourceTypeFamily.exportName
        ? [declaration.sourceName]
        : [declaration.sourceName, declaration.sourceTypeFamily.exportName]
      : [declaration.sourceName]
  ));
  const unsupportedExports = new Set((module.unsupportedExports ?? []).map((declaration) => declaration.sourceName));
  return requestedExports.filter((exportName) => !exports.has(exportName) && !unsupportedExports.has(exportName));
}

function missingRequestedTargetIds(
  module: DotnetModuleModel,
  requestedTargetIds: readonly string[] | undefined,
): readonly string[] {
  if (requestedTargetIds === undefined) {
    return [];
  }
  const targetIds = new Set([...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter((declaration) => declaration.kind === "type")
    .map((declaration) => declaration.targetId));
  return requestedTargetIds.filter((targetId) => !targetIds.has(targetId));
}

function missingRequestedMetadataNames(
  module: DotnetModuleModel,
  requestedMetadataNames: readonly string[] | undefined,
): readonly string[] {
  if (requestedMetadataNames === undefined) {
    return [];
  }
  const metadataNames = new Set([...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter((declaration) => declaration.kind === "type")
    .map((declaration) => declaration.metadataName));
  return requestedMetadataNames.filter((metadataName) => !metadataNames.has(metadataName));
}
