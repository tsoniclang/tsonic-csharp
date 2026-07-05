import type {
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";

export function getPreferredTargetTypeRefForSubject(
  directFact: TargetTypeRef | undefined,
  referenceFact: TargetTypeRef | undefined,
  declarationType: TargetTypeRef | undefined = undefined,
): TargetTypeRef | undefined {
  if (declarationType !== undefined) {
    const declarationPreference = preferredProvenTargetTypeOverSemanticNumber(declarationType, directFact) ??
      preferredProvenTargetTypeOverSemanticNumber(declarationType, referenceFact);
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
  const referencePreference = preferredProvenTargetTypeOverSemanticNumber(referenceFact, directFact);
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

function preferredProvenTargetTypeOverSemanticNumber(
  provenType: TargetTypeRef,
  existing: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (existing === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(provenType, existing)) {
    return undefined;
  }
  return sameShapeWithProvenNumberCarrier(provenType, existing) ? provenType : undefined;
}

function sameShapeWithProvenNumberCarrier(provenType: TargetTypeRef, existing: TargetTypeRef): boolean {
  if (provenType.kind === "source-primitive" && existing.kind === "source-primitive") {
    return provenType.name !== existing.name &&
      sourcePrimitiveRuntimeKind(provenType.name) === "number" &&
      existing.name === "float64";
  }
  if (provenType.kind === "array" && existing.kind === "array" && (provenType.rank ?? 1) === (existing.rank ?? 1)) {
    return sameShapeWithProvenNumberCarrier(provenType.element, existing.element);
  }
  if (provenType.kind === "tuple" && existing.kind === "tuple" && provenType.elements.length === existing.elements.length) {
    return provenType.elements.every((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined &&
        (targetTypeRefEquals(element, existingElement) || sameShapeWithProvenNumberCarrier(element, existingElement));
    }) && provenType.elements.some((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined && sameShapeWithProvenNumberCarrier(element, existingElement);
    });
  }
  if (provenType.kind === "target-named" && existing.kind === "target-named" && provenType.id === existing.id) {
    const candidateArguments = provenType.typeArguments ?? [];
    const existingArguments = existing.typeArguments ?? [];
    if (candidateArguments.length !== existingArguments.length) {
      return false;
    }
    return candidateArguments.every((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || sameShapeWithProvenNumberCarrier(argument, existingArgument));
    }) && candidateArguments.some((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined && sameShapeWithProvenNumberCarrier(argument, existingArgument);
    });
  }
  if (provenType.kind === "pointer" && existing.kind === "pointer" && provenType.mutability === existing.mutability) {
    return sameShapeWithProvenNumberCarrier(provenType.pointee, existing.pointee);
  }
  if (provenType.kind === "function-pointer" && existing.kind === "function-pointer" && provenType.args.length === existing.args.length) {
    const resultMatches = targetTypeRefEquals(provenType.result, existing.result) ||
      sameShapeWithProvenNumberCarrier(provenType.result, existing.result);
    const argsMatch = provenType.args.every((argument, index) => {
      const existingArgument = existing.args[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || sameShapeWithProvenNumberCarrier(argument, existingArgument));
    });
    const anyProven = sameShapeWithProvenNumberCarrier(provenType.result, existing.result) ||
      provenType.args.some((argument, index) => {
        const existingArgument = existing.args[index];
        return existingArgument !== undefined && sameShapeWithProvenNumberCarrier(argument, existingArgument);
      });
    return resultMatches && argsMatch && anyProven;
  }
  return false;
}

function sourcePrimitiveRuntimeKind(kind: SourcePrimitiveKind): "string" | "number" | "boolean" | "bigint" {
  if (kind === "bool") {
    return "boolean";
  }
  if (kind === "char") {
    return "string";
  }
  return kind === "int64" || kind === "uint64" || kind === "int128" || kind === "uint128"
    ? "bigint"
    : "number";
}

function isSourceDeclarationTargetTypeRef(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}
