import type {
  TargetTypeRef,
} from "@tsonic/tsts";

export function getPreferredTargetTypeRefForSubject(
  directFact: TargetTypeRef | undefined,
  referenceFact: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (directFact === undefined) {
    return referenceFact;
  }
  if (referenceFact === undefined) {
    return directFact;
  }
  if (directFact.kind === "array" && referenceFact.kind !== "array") {
    return referenceFact;
  }
  if (isSourceDeclarationTargetTypeRef(directFact) && !isSourceDeclarationTargetTypeRef(referenceFact)) {
    return referenceFact;
  }
  return directFact;
}

function isSourceDeclarationTargetTypeRef(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}
