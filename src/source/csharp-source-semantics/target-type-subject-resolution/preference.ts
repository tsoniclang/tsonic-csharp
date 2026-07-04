import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  targetTypeRefRefinesBroadNumericFallback,
} from "../target-ref-utils.js";

export function getPreferredTargetTypeRefForSubject(
  directFact: TargetTypeRef | undefined,
  referenceFact: TargetTypeRef | undefined,
  declarationType: TargetTypeRef | undefined = undefined,
): TargetTypeRef | undefined {
  if (declarationType !== undefined) {
    const declarationPreference = preferredExplicitSourcePrimitiveType(declarationType, directFact) ??
      preferredExplicitSourcePrimitiveType(declarationType, referenceFact);
    if (declarationPreference !== undefined) {
      return declarationPreference;
    }
  }
  if (directFact === undefined) {
    return referenceFact;
  }
  if (referenceFact === undefined) {
    return directFact;
  }
  const referencePreference = preferredExplicitSourcePrimitiveType(referenceFact, directFact);
  if (referencePreference !== undefined) {
    return referencePreference;
  }
  if (directFact.kind === "array" && referenceFact.kind !== "array") {
    return referenceFact;
  }
  if (isSourceDeclarationTargetTypeRef(directFact) && !isSourceDeclarationTargetTypeRef(referenceFact)) {
    return referenceFact;
  }
  return directFact;
}

function preferredExplicitSourcePrimitiveType(
  candidate: TargetTypeRef,
  existing: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (existing === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(candidate, existing)) {
    return undefined;
  }
  return targetTypeRefRefinesBroadNumericFallback(candidate, existing) ? candidate : undefined;
}

function isSourceDeclarationTargetTypeRef(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}
