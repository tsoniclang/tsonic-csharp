import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
} from "@tsonic/tsts";

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
  return lookupByTargetId(targetIdentity.id) ?? lookupByMetadataName?.(targetIdentity.id);
}
