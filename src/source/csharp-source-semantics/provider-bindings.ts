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
  findCsharpDotnetTargetBindingByTargetId,
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
  if (subject === undefined) {
    return undefined;
  }
  return canonicalCsharpTargetBinding(context.factResolver.resolve(subject, targetBindingFactKey));
}

export function getKnownTargetBindingForTypeRef(type: TargetTypeRef | undefined): TargetBindingFact | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const providerDeclaration = findCsharpDotnetProviderExportByTargetId(type.id);
  return findCsharpDotnetTargetBindingByTargetId(type.id) ??
    (providerDeclaration === undefined ? undefined : providerDeclarationToTargetBinding(providerDeclaration));
}

function canonicalCsharpTargetBinding(binding: TargetBindingFact | undefined): TargetBindingFact | undefined {
  return binding?.target === "csharp"
    ? findCsharpDotnetTargetBindingByTargetId(binding.id) ?? binding
    : binding;
}
