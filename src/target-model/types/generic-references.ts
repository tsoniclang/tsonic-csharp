import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "./model.js";
import { targetTypeRefKey } from "./equality.js";
import { csharpTargetTypeComponents } from "./components.js";
import { csharpTypeProjection } from "./projections.js";

export function csharpFreeTypeParameterIdentities(types: readonly TargetTypeRef[]): ReadonlySet<string> {
  const identities = new Set<string>();
  const pending = [...types];
  const visited = new Set<TargetTypeRef>();
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index]!;
    if (visited.has(type)) continue;
    visited.add(type);
    const projection = csharpTypeProjection(type);
    if (projection !== undefined) pending.push(...projection.csharpProjection.arguments);
    else if (type.kind === "type-parameter") identities.add(type.identity);
    else pending.push(...csharpTargetTypeComponents(type));
  }
  return identities;
}

export function visitCsharpTargetTypeParameters(
  type: TargetTypeRef,
  visit: (parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>) => void,
): void {
  switch (type.kind) {
    case "type-parameter":
      visit(type);
      return;
    case "source-global":
    case "target-named":
      for (const argument of type.typeArguments ?? []) visitCsharpTargetTypeParameters(argument, visit);
      return;
    case "array":
      visitCsharpTargetTypeParameters(type.element, visit);
      return;
    case "tuple":
      for (const element of type.elements) visitCsharpTargetTypeParameters(element, visit);
      return;
    case "pointer":
      visitCsharpTargetTypeParameters(type.pointee, visit);
      return;
    case "function-pointer":
      for (const argument of type.args) visitCsharpTargetTypeParameters(argument, visit);
      visitCsharpTargetTypeParameters(type.result, visit);
      return;
    case "associated-type":
      visitCsharpTargetTypeParameters(type.owner, visit);
      return;
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return;
  }
}

export function csharpObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] {
  const parameters = new Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
  const collect = (type: TargetTypeRef, bound?: ReadonlySet<string>): void => {
    visitCsharpTargetTypeParameters(type, parameter => {
      if (bound?.has(parameter.identity) !== true) parameters.set(parameter.identity, parameter);
    });
  };
  for (const member of members) {
    const bound = new Set(member.typeParameters?.map(parameter => parameter.identity));
    collect(member.type, bound);
    if (member.methodStorageType !== undefined) collect(member.methodStorageType);
    for (const parameter of member.typeParameters ?? []) {
      for (const constraint of parameter.constraints) {
        if (constraint.kind === "type") collect(constraint.type, bound);
      }
    }
  }
  for (const type of implemented ?? []) collect(type);
  for (const capture of implementation?.captures ?? []) collect(capture.type);
  return [...parameters.values()].sort((left, right) => targetTypeRefKey(left).localeCompare(targetTypeRefKey(right)));
}
