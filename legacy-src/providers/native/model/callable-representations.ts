import type { DotnetTypeRef } from "./types.js";
import { dotnetTypeRefKey } from "./type-refs.js";

export function dotnetCallableRepresentationIssue(
  type: Extract<DotnetTypeRef, { readonly kind: "named" }>,
): string | undefined {
  const representation = type.callableRepresentation;
  if (representation === undefined) {
    return type.sourceShape?.kind === "function"
      ? "A source function shape requires exact native delegate or expression-tree representation evidence." : undefined;
  }
  if (representation === "delegate") {
    return type.sourceShape?.kind === "function" ? undefined : "A native delegate requires its source function shape.";
  }
  if (representation !== "expression-tree") return "Unknown native callable representation.";
  const delegate = type.typeArguments?.[0];
  if (type.typeArguments?.length === 1) {
    if (delegate?.kind === "type-parameter" && type.sourceShape?.kind === "type-parameter" &&
      delegate.identity === type.sourceShape.identity) return undefined;
    if (delegate?.kind === "named" && delegate.callableRepresentation === "delegate" &&
      delegate.sourceShape?.kind === "function" && type.sourceShape?.kind === "function" &&
      matchingQuotationSignature(delegate.sourceShape, type.sourceShape)) return undefined;
  }
  return "An expression tree requires one exact native delegate argument with the identical source signature or generic parameter identity.";
}

function matchingQuotationSignature(
  delegate: Extract<DotnetTypeRef, { readonly kind: "function" }>,
  quotation: Extract<DotnetTypeRef, { readonly kind: "function" }>,
): boolean {
  return dotnetTypeRefKey(delegate) === dotnetTypeRefKey(quotation) &&
    delegate.parameters.length === quotation.parameters.length &&
    delegate.parameters.every((parameter, index) => {
      const selected = quotation.parameters[index]!;
      return parameter.passingMode === selected.passingMode && parameter.optional === selected.optional &&
        parameter.rest === selected.rest;
    });
}
