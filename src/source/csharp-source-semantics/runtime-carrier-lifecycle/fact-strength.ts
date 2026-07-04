import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import {
  isGeneratedObjectShapeCarrier,
  isSourceDeclarationCarrier,
} from "./carrier-classification.js";

export function shouldReplaceUseSiteRuntimeCarrier(existing: TargetTypeRef, replacement: TargetTypeRef): boolean {
  if (isGeneratedObjectShapeCarrier(replacement)) {
    return false;
  }
  if (isSourceDeclarationCarrier(existing) && !isSourceDeclarationCarrier(replacement)) {
    return true;
  }
  if (canRefineBroadNumericFallback(replacement, existing)) {
    return true;
  }
  return false;
}

function canRefineBroadNumericFallback(candidate: TargetTypeRef, existing: TargetTypeRef): boolean {
  if (targetTypeRefEquals(candidate, existing)) {
    return false;
  }
  if (candidate.kind === "source-primitive" && existing.kind === "source-primitive") {
    return candidate.name !== "float64" && existing.name === "float64";
  }
  if (candidate.kind === "array" && existing.kind === "array" && (candidate.rank ?? 1) === (existing.rank ?? 1)) {
    return canRefineBroadNumericFallback(candidate.element, existing.element);
  }
  if (candidate.kind === "tuple" && existing.kind === "tuple" && candidate.elements.length === existing.elements.length) {
    return candidate.elements.every((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined &&
        (targetTypeRefEquals(element, existingElement) || canRefineBroadNumericFallback(element, existingElement));
    }) && candidate.elements.some((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined && canRefineBroadNumericFallback(element, existingElement);
    });
  }
  if (candidate.kind === "target-named" && existing.kind === "target-named" && candidate.id === existing.id) {
    const candidateArguments = candidate.typeArguments ?? [];
    const existingArguments = existing.typeArguments ?? [];
    if (candidateArguments.length !== existingArguments.length) {
      return false;
    }
    return candidateArguments.every((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || canRefineBroadNumericFallback(argument, existingArgument));
    }) && candidateArguments.some((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined && canRefineBroadNumericFallback(argument, existingArgument);
    });
  }
  if (candidate.kind === "pointer" && existing.kind === "pointer" && candidate.mutability === existing.mutability) {
    return canRefineBroadNumericFallback(candidate.pointee, existing.pointee);
  }
  if (candidate.kind === "function-pointer" && existing.kind === "function-pointer" && candidate.args.length === existing.args.length) {
    const resultMatches = targetTypeRefEquals(candidate.result, existing.result) ||
      canRefineBroadNumericFallback(candidate.result, existing.result);
    const argsMatch = candidate.args.every((argument, index) => {
      const existingArgument = existing.args[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || canRefineBroadNumericFallback(argument, existingArgument));
    });
    const anyRefined = canRefineBroadNumericFallback(candidate.result, existing.result) ||
      candidate.args.some((argument, index) => {
        const existingArgument = existing.args[index];
        return existingArgument !== undefined && canRefineBroadNumericFallback(argument, existingArgument);
      });
    return resultMatches && argsMatch && anyRefined;
  }
  return false;
}
