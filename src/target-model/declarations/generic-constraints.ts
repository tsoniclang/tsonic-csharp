import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefKey } from "../types/equality.js";

export type CsharpTypeParameterConstraint =
  | { readonly kind: "type"; readonly type: TargetTypeRef }
  | {
      readonly kind: "keyword";
      readonly keyword: "class" | "struct" | "notnull" | "unmanaged";
    }
  | { readonly kind: "constructor" };

export type CsharpTypeParameterConstraintResolution =
  | {
      readonly kind: "resolved";
      readonly constraints: readonly CsharpTypeParameterConstraint[];
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

export function csharpTypeParameterConstraintResolutionKey(
  resolution: CsharpTypeParameterConstraintResolution | undefined,
): string {
  return resolution === undefined ? "missing" : resolution.kind === "unsupported"
    ? JSON.stringify([resolution.kind, resolution.reason])
    : JSON.stringify(resolution.constraints.map(constraint => constraint.kind === "type"
      ? [constraint.kind, targetTypeRefKey(constraint.type)] : constraint.kind === "keyword"
        ? [constraint.kind, constraint.keyword] : [constraint.kind]));
}

export function csharpOwnerTypeParameterConstraintKey(type: TargetTypeRef): string {
  return JSON.stringify((type.kind === "source-global" || type.kind === "target-named" ? type.typeArguments ?? [] : [])
    .flatMap(argument => argument.kind === "type-parameter" ? [[argument.identity,
      csharpTypeParameterConstraintResolutionKey(argument.csharpConstraints)]] : []));
}
