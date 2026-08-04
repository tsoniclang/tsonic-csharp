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
  readonly modulesBySpecifier: Map<string, DotnetModuleModel[]>;
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
    modulesBySpecifier: new Map([[module.moduleSpecifier, [module]]]),
    ...(options.resolveModule !== undefined ? { resolveModule: options.resolveModule } : {}),
  };
}

export function dotnetProviderRefToTypeDeclaration(
  baseType: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
  context: DotnetDeclarationContext,
): DotnetTypeDeclaration | undefined {
  if (baseType.moduleSpecifier === context.moduleSpecifier) {
    return selectDotnetTypeDeclarationForProviderRef(
      [...context.typesBySourceName.values()],
      baseType,
    );
  }
  const module = getDotnetModuleBySpecifier(
    baseType.moduleSpecifier,
    context,
    [baseType.exportName],
    { kind: "complete" },
  );
  if (module === undefined) {
    return undefined;
  }
  return selectDotnetTypeDeclarationForProviderRef(
    module.exports.filter((declaration): declaration is DotnetTypeDeclaration => declaration.kind === "type"),
    baseType,
  );
}

function selectDotnetTypeDeclarationForProviderRef(
  declarations: readonly DotnetTypeDeclaration[],
  providerRef: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
): DotnetTypeDeclaration | undefined {
  const typeArgumentCount = providerRef.typeArguments?.length ?? 0;
  return declarations.find((declaration) =>
    declaration.sourceName === providerRef.exportName &&
    declaration.sourceTypeFamily === undefined
  ) ?? declarations.find((declaration) =>
    declaration.sourceTypeFamily?.exportName === providerRef.exportName &&
    declaration.sourceTypeFamily.typeArgumentCount === typeArgumentCount
  );
}

export function getDotnetModuleBySpecifier(
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
  requestedExports: readonly string[],
  materialization: ProviderDeclarationMaterialization,
): DotnetModuleModel | undefined {
  const existing = context.modulesBySpecifier.get(moduleSpecifier)
    ?.find((module) => dotnetModuleIncludesRequestedExports(module, requestedExports));
  if (existing !== undefined) {
    return existing;
  }
  const resolved = context.resolveModule?.(moduleSpecifier, requestedExports, materialization);
  if (resolved !== undefined) {
    const qualified = qualifyDotnetModuleProviderRefs(resolved);
    const modules = context.modulesBySpecifier.get(moduleSpecifier);
    if (modules === undefined) {
      context.modulesBySpecifier.set(moduleSpecifier, [qualified]);
    } else {
      modules.push(qualified);
    }
    return qualified;
  }
  return undefined;
}

export function dotnetModuleExportsSourceName(
  moduleSpecifier: string,
  sourceName: string,
  context: DotnetDeclarationContext,
): boolean {
  const module = getDotnetModuleBySpecifier(
    moduleSpecifier,
    context,
    [sourceName],
    { kind: "incremental", completeExports: [] },
  );
  return module?.exports.some((declaration) =>
    declaration.kind === "type" && declaration.sourceName === sourceName
  ) === true;
}

function dotnetModuleIncludesRequestedExports(module: DotnetModuleModel, requestedExports: readonly string[]): boolean {
  if (requestedExports.length === 0) {
    return true;
  }
  const sourceNames = new Set(module.exports.map((declaration) => declaration.sourceName));
  return requestedExports.every((sourceName) => sourceNames.has(sourceName));
}
