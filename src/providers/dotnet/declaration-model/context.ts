import type {
  ProviderMemberDeclaration,
  ProviderDeclarationMaterialization,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
  DotnetTypeDeclaration,
} from "../model.js";
import { qualifyDotnetModuleProviderRefs } from "./provider-ref-qualification.js";

export interface DotnetProviderDeclarationModelOptions {
  readonly providerModuleId?: string;
  readonly resolveModule?: (
    specifier: string,
    requestedExports: readonly string[],
    materialization: ProviderDeclarationMaterialization,
  ) => DotnetModuleModel | undefined;
}

export interface DotnetDeclarationContext {
  readonly moduleSpecifier: string;
  readonly sourceModuleSpecifier: string;
  readonly typesBySourceName: ReadonlyMap<string, DotnetTypeDeclaration>;
  readonly sourceMembersByTargetId: Map<string, readonly ProviderMemberDeclaration[]>;
  readonly resolveModule?: DotnetProviderDeclarationModelOptions["resolveModule"];
}

export function createDotnetDeclarationContext(
  module: DotnetModuleModel,
  options: DotnetProviderDeclarationModelOptions = {},
): DotnetDeclarationContext {
  return {
    moduleSpecifier: module.moduleSpecifier,
    sourceModuleSpecifier: options.providerModuleId ?? module.moduleSpecifier,
    typesBySourceName: new Map(module.exports
      .filter((declaration): declaration is DotnetTypeDeclaration => declaration.kind === "type")
      .map((declaration) => [declaration.sourceName, declaration])),
    sourceMembersByTargetId: new Map(),
    ...(options.resolveModule !== undefined ? { resolveModule: options.resolveModule } : {}),
  };
}

export function dotnetProviderRefToTypeDeclaration(
  baseType: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
  context: DotnetDeclarationContext,
  exportId?: string,
): DotnetTypeDeclaration | undefined {
  if (baseType.moduleSpecifier === context.moduleSpecifier) {
    return selectDotnetTypeDeclarationForProviderRef(
      [...context.typesBySourceName.values()],
      baseType,
      exportId,
    );
  }
  const resolved = context.resolveModule?.(
    baseType.moduleSpecifier,
    [baseType.exportName],
    exactDotnetProviderRefMaterialization(baseType.exportName, exportId),
  );
  if (resolved === undefined) {
    return undefined;
  }
  const module = qualifyDotnetModuleProviderRefs(resolved);
  return selectDotnetTypeDeclarationForProviderRef(
    module.exports.filter((declaration): declaration is DotnetTypeDeclaration => declaration.kind === "type"),
    baseType,
    exportId,
  );
}

function selectDotnetTypeDeclarationForProviderRef(
  declarations: readonly DotnetTypeDeclaration[],
  providerRef: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
  exportId?: string,
): DotnetTypeDeclaration | undefined {
  const typeArgumentCount = providerRef.typeArguments?.length ?? 0;
  const matches = declarations.filter((declaration) =>
    (declaration.sourceName === providerRef.exportName && declaration.sourceTypeFamily === undefined) ||
    (declaration.sourceTypeFamily?.exportName === providerRef.exportName &&
      declaration.sourceTypeFamily.typeArgumentCount === typeArgumentCount)
  );
  return exportId === undefined
    ? matches[0]
    : matches.find((declaration) => declaration.targetId === exportId);
}

function exactDotnetProviderRefMaterialization(
  exportName: string,
  exportId: string | undefined,
): ProviderDeclarationMaterialization {
  const completeExport = Object.freeze({
    exportName,
    ...(exportId === undefined ? {} : { exportId }),
  });
  return Object.freeze({
    kind: "incremental",
    completeExports: Object.freeze([completeExport]),
  });
}
