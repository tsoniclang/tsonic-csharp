import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { targetTypeRefKey } from "./equality.js";

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

export type CsharpExplicitImplementationConstraint = "class" | "default" | undefined;

export function csharpConstraintsRequireReference(
  constraints: readonly CsharpTypeParameterConstraint[],
  parameters: ReadonlyMap<string, readonly CsharpTypeParameterConstraint[]> = new Map(),
): boolean {
  if (constraints.some(constraint => constraint.kind === "keyword" && constraint.keyword === "class")) return true;
  const pending = [...constraints];
  const visited = new Set<string>();
  for (let index = 0; index < pending.length; index += 1) {
    const constraint = pending[index]!;
    if (constraint.kind !== "type") continue;
    const type = constraint.type;
    if (type.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpConstraintRequiresReferenceType === true) return true;
    if (type.kind !== "type-parameter" || visited.has(type.identity)) continue;
    visited.add(type.identity);
    const bound = parameters.get(type.identity);
    if (bound !== undefined) pending.push(...bound);
    else if (type.csharpConstraints?.kind === "resolved") pending.push(...type.csharpConstraints.constraints);
  }
  return false;
}

export function csharpTypeParameterConstraintResolutionKey(
  resolution: CsharpTypeParameterConstraintResolution | undefined,
): string {
  return resolution === undefined ? "missing" : resolution.kind === "unsupported"
    ? JSON.stringify([resolution.kind, resolution.reason])
    : JSON.stringify([...resolution.constraints.map(constraint => constraint.kind === "type"
      ? [constraint.kind, targetTypeRefKey(constraint.type)] : constraint.kind === "keyword"
        ? [constraint.kind, constraint.keyword] : [constraint.kind]),
      ...(csharpConstraintsRequireReference(resolution.constraints) ? [["reference-proof"]] : [])]);
}

export function csharpOwnerTypeParameterConstraintKey(type: TargetTypeRef): string {
  return JSON.stringify((type.kind === "target-named" ? type.typeArguments ?? [] : [])
    .flatMap(argument => argument.kind === "type-parameter" ? [[argument.identity,
      csharpTypeParameterConstraintResolutionKey(argument.csharpConstraints)]] : []));
}
