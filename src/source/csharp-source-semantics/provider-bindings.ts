import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  parseDotnetModuleSpecifier,
} from "../../providers/dotnet/module-specifier.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";
import {
  csharpApplyExternAliasToTargetBinding,
} from "./target-types.js";

export function findTargetBinding(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = resolveTargetBinding(subject, context);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

export function resolveTargetBinding(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetBindingFact | undefined {
  if (subject === undefined) {
    return undefined;
  }
  return context.factResolver.resolve(subject, targetBindingFactKey);
}

export function findTargetBindingFromVirtualDeclaration(
  declaration: ProviderVirtualDeclarationFact | undefined,
  lookupByTargetId: (targetId: string) => TargetBindingFact | undefined,
  lookupByMetadataName?: (metadataName: string) => TargetBindingFact | undefined,
): TargetBindingFact | undefined {
  const targetIdentity = declaration?.targetIdentity;
  if (targetIdentity?.kind !== "target-named") {
    return undefined;
  }
  return applyProviderVirtualExternAlias(
    lookupByTargetId(targetIdentity.id) ?? lookupByMetadataName?.(targetIdentity.id),
    declaration,
  );
}

export function applyProviderVirtualExternAlias(
  binding: TargetBindingFact | undefined,
  declaration: ProviderVirtualDeclarationFact | undefined,
): TargetBindingFact | undefined {
  if (binding === undefined || declaration === undefined) {
    return binding;
  }
  const parsedModule = parseDotnetModuleSpecifier(declaration.moduleSpecifier);
  return parsedModule?.externAlias === undefined
    ? binding
    : csharpApplyExternAliasToTargetBinding(binding, parsedModule.externAlias);
}

export function findTargetBindingFromResolvedTargetType(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
  resolveTargetTypeRef: TargetTypeRefResolver,
  lookupByTargetId: (targetId: string) => TargetBindingFact | undefined,
  lookupByMetadataName?: (metadataName: string) => TargetBindingFact | undefined,
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = findTargetBindingForTargetType(
      resolveTargetTypeRef(subject, context, { allowRuntimeCarrier: false }) ??
        resolveTargetTypeRef(subject, context),
      lookupByTargetId,
      lookupByMetadataName,
    );
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

function findTargetBindingForTargetType(
  type: TargetTypeRef | undefined,
  lookupByTargetId: (targetId: string) => TargetBindingFact | undefined,
  lookupByMetadataName?: (metadataName: string) => TargetBindingFact | undefined,
): TargetBindingFact | undefined {
  return type?.kind === "target-named"
    ? lookupByTargetId(type.id) ?? lookupByMetadataName?.(type.id)
    : undefined;
}
