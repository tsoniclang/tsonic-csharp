import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  findCsharpDotnetProviderExportByTargetId,
} from "../../providers/dotnet/index.js";
import {
  providerDeclarationToTargetBinding,
} from "./provider-binding-conversion.js";

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
  return subject === undefined ? undefined : context.factResolver.resolve(subject, targetBindingFactKey);
}

export function getKnownTargetBindingForTypeRef(type: TargetTypeRef | undefined): TargetBindingFact | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const declaration = findCsharpDotnetProviderExportByTargetId(type.id);
  return declaration === undefined ? undefined : providerDeclarationToTargetBinding(declaration);
}
