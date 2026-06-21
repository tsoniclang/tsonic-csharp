import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetBindingFact,
} from "@tsonic/tsts";
import {
  findCsharpDotnetTargetBindingByTargetId,
} from "../../providers/dotnet/index.js";

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

function canonicalCsharpTargetBinding(binding: TargetBindingFact | undefined): TargetBindingFact | undefined {
  return binding?.target === "csharp"
    ? findCsharpDotnetTargetBindingByTargetId(binding.id) ?? binding
    : binding;
}
