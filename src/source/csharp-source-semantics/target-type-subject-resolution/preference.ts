import type {
  TargetTypeRef,
} from "@tsonic/tsts";

export function getPreferredTargetTypeRefForSubject(
  directFact: TargetTypeRef | undefined,
  referenceFact: TargetTypeRef | undefined,
  declarationType: TargetTypeRef | undefined = undefined,
): TargetTypeRef | undefined {
  const primitiveDeclarationPreference = preferredSourcePrimitiveDeclarationType(
    declarationType,
    directFact,
    referenceFact,
  );
  if (primitiveDeclarationPreference !== undefined) {
    return primitiveDeclarationPreference;
  }
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

function preferredSourcePrimitiveDeclarationType(
  declarationType: TargetTypeRef | undefined,
  directFact: TargetTypeRef | undefined,
  referenceFact: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (declarationType?.kind !== "source-primitive") {
    return undefined;
  }
  if (
    (directFact === undefined || directFact.kind === "source-primitive") &&
    (referenceFact === undefined || referenceFact.kind === "source-primitive")
  ) {
    return declarationType;
  }
  return undefined;
}

function isSourceDeclarationTargetTypeRef(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}
