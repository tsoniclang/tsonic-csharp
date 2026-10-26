import type { TargetTypeRef } from "../types/index.js";

import { csharpQualifiedTypeRenderShape, csharpTargetNamedType, isCsharpStringTargetType, isCsharpValueTypeTargetType, targetTypeRefKey } from "../types/index.js";
import type { CsharpExplicitImplementationConstraint, CsharpTypeParameterConstraint, CsharpTypeParameterConstraintResolution } from "../../target-model/types/generic-constraints.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpConversionShapeQueries } from "../conversions/shape-queries.js";
import { namedTargetTypeImplicitlyAccepts } from "../conversions/carriers.js";
import { getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../target-model/types/index.js";
import { csharpConstraintsRequireReference } from "../../target-model/types/generic-constraints.js";
import { visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";

export function csharpTypeParameterConstraintsImply(
  policy: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "typeDefinitions"> & CsharpConversionShapeQueries,
  source: readonly CsharpTypeParameterConstraint[],
  required: readonly CsharpTypeParameterConstraint[],
  parameters: ReadonlyMap<string, readonly CsharpTypeParameterConstraint[]>,
): boolean {
  const inherited = [...source];
  const visited = new Set<string>();
  for (let index = 0; index < inherited.length; index += 1) {
    const constraint = inherited[index]!;
    if (constraint.kind !== "type" || constraint.type.kind !== "type-parameter" || visited.has(constraint.type.identity)) continue;
    visited.add(constraint.type.identity);
    const stored = parameters.get(constraint.type.identity);
    const resolution = constraint.type.csharpConstraints;
    const constraints = stored ?? (resolution?.kind === "resolved" ? resolution.constraints : undefined);
    if (constraints !== undefined) inherited.push(...constraints);
  }
  const keyword = (name: Extract<CsharpTypeParameterConstraint, { readonly kind: "keyword" }>["keyword"]): boolean =>
    inherited.some(constraint => constraint.kind === "keyword" && constraint.keyword === name);
  const directKeyword = (name: Extract<CsharpTypeParameterConstraint, { readonly kind: "keyword" }>["keyword"]): boolean =>
    source.some(constraint => constraint.kind === "keyword" && constraint.keyword === name);
  return required.every(constraint => {
    if (constraint.kind === "type") return inherited.some(candidate => candidate.kind === "type" &&
      namedTargetTypeImplicitlyAccepts(policy, candidate.type, constraint.type, new Set()));
    if (constraint.kind === "constructor") return source.some(candidate => candidate.kind === "constructor" ||
      candidate.kind === "keyword" && (candidate.keyword === "struct" || candidate.keyword === "unmanaged"));
    switch (constraint.keyword) {
      case "class": return csharpConstraintsRequireReference(source, parameters);
      case "struct": return directKeyword("struct") || directKeyword("unmanaged");
      case "unmanaged": return directKeyword("unmanaged");
      case "notnull": return keyword("notnull") || keyword("class") || keyword("struct") || keyword("unmanaged") ||
        inherited.some(candidate => candidate.kind === "type" && candidate.type.kind === "target-named" &&
          getCsharpNullableElementTargetType(candidate.type) === undefined && !isCsharpNullableReferenceTargetType(candidate.type));
    }
  });
}

export function selectCsharpExplicitImplementationConstraints(
  parameters: readonly { readonly identity: string; readonly constraints: readonly CsharpTypeParameterConstraint[] }[],
  signatureTypes: readonly TargetTypeRef[],
): readonly CsharpExplicitImplementationConstraint[] {
  const nullable = new Set<string>();
  for (const type of signatureTypes) visitCsharpTargetTypeParameters(type, parameter => {
    if (isCsharpNullableReferenceTargetType(parameter)) nullable.add(parameter.identity);
  });
  return Object.freeze(parameters.map(parameter => {
    if (!nullable.has(parameter.identity) || parameter.constraints.some(constraint =>
      constraint.kind === "keyword" && (constraint.keyword === "struct" || constraint.keyword === "unmanaged"))) return undefined;
    return csharpConstraintsRequireReference(parameter.constraints) ? "class" : "default";
  }));
}

export function csharpTypeParameterConstraintsEqual(
  left: readonly CsharpTypeParameterConstraint[], right: readonly CsharpTypeParameterConstraint[],
): boolean {
  const expected = new Set(left.map(csharpTypeParameterConstraintKey));
  const actual = new Set(right.map(csharpTypeParameterConstraintKey));
  return expected.size === actual.size && [...expected].every(key => actual.has(key));
}

export function csharpTypeParameterConstraintKey(constraint: CsharpTypeParameterConstraint): string {
  switch (constraint.kind) {
    case "type":
      return `type:${targetTypeRefKey(constraint.type)}`;
    case "keyword":
      return `keyword:${constraint.keyword}`;
    case "constructor":
      return "constructor";
  }
}

export function csharpTypeParameterConstraintOrder(constraint: CsharpTypeParameterConstraint): number {
  switch (constraint.kind) {
    case "keyword":
      return 0;
    case "type":
      return 1;
    case "constructor":
      return 2;
  }
}
export function selectCsharpNativeTypeParameterConstraint(
  targetType: TargetTypeRef | undefined,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  objectKeyword: boolean,
  numeric: boolean,
): CsharpTypeParameterConstraintResolution {
  if (objectKeyword) return { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] };
  if (numeric) return { kind: "resolved", constraints: [{ kind: "type",
    type: csharpTargetNamedType("System.Numerics.INumber`1", [parameter],
      csharpQualifiedTypeRenderShape("System.Numerics", "INumber"), { allowsRefLikeTypeArguments: [false] }),
  }] };
  if (targetType === undefined) return { kind: "unsupported", reason: "The source constraint has no exact C# target representation." };
  if (targetType.kind === "type-parameter" || targetType.kind === "target-named" &&
    !isCsharpStringTargetType(targetType) && !isCsharpValueTypeTargetType(targetType)) {
    return { kind: "resolved", constraints: [{ kind: "type", type: targetType }] };
  }
  return { kind: "unsupported", reason: "The selected source constraint cannot be represented as an exact C# generic constraint." };
}
