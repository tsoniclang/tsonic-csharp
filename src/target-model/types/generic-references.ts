import type { TargetTypeRef } from "./native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "./model.js";

import { csharpNativeCallableMemberComponents, csharpTargetTypeComponents } from "./components.js";

import { createCsharpMetadataBudget } from "../metadata/immutable.js";
import { csharpOptionalStorageDefinitionNames } from "./native-generics.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
type TraversalBudget = ReturnType<typeof createCsharpMetadataBudget>;

export function csharpFreeTypeParameterIdentities(types: readonly TargetTypeRef[]): ReadonlySet<string> {
  const budget = createCsharpMetadataBudget();
  const identities = new Set<string>();
  walkTypeParameters(types, parameter => identities.add(parameter.identity), budget);
  return identities;
}

export function visitCsharpTargetTypeParameters(type: TargetTypeRef, visit: (parameter: TypeParameter) => void, budget = createCsharpMetadataBudget()): void {
  walkTypeParameters([type], visit, budget);
}

function walkTypeParameters(types: readonly TargetTypeRef[], visit: (parameter: TypeParameter) => void, budget: TraversalBudget): void {
  budget.reserve(types.length);
  const unbound: ReadonlySet<string> = new Set();
  const pending = types.map(type => ({ type, bound: unbound, depth: 0 }));
  const visited = new Map<TargetTypeRef, ReadonlySet<string>>();
  const enqueue = (type: TargetTypeRef, bound: ReadonlySet<string>, depth: number): void => {
    budget.reserve(1, depth);
    pending.push({ type, bound, depth });
  };
  for (let index = 0; index < pending.length; index += 1) {
    const selected = pending[index]!;
    const type = selected.type;
    const previous = visited.get(type);
    budget.reserve(previous?.size ?? 0);
    const bound = previous === undefined ? selected.bound : new Set([...previous].filter(identity => selected.bound.has(identity)));
    if (previous !== undefined && bound.size === previous.size) continue;
    visited.set(type, bound);
    if (type.kind === "type-parameter") {
      if (!bound.has(type.identity)) visit(type);
      for (const component of csharpTargetTypeComponents(type, undefined, false)) enqueue(component, bound, selected.depth + 1);
      if (type.csharpProjection !== undefined) for (const name of csharpOptionalStorageDefinitionNames) {
        const definition = type.csharpProjection.definitions[name];
        budget.reserve(bound.size + definition.parameters.length);
        enqueue(definition.carrier, new Set([...bound, ...definition.parameters]), selected.depth + 1);
      }
    } else {
      const method = type.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue : undefined;
      const members = type.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpCallableMembers ?? [] : [];
      for (const component of csharpTargetTypeComponents(type, undefined, false)) enqueue(component, bound, selected.depth + 1);
      if (method !== undefined) {
        budget.reserve(bound.size + method.typeParameters.length);
        enqueue(method.contract, new Set([...bound, ...method.typeParameters]), selected.depth + 1);
      }
      for (const member of members) {
        budget.reserve(bound.size + member.typeParameters.length);
        const memberBound = new Set([...bound, ...member.typeParameters.map(parameter => parameter.identity)]);
        for (const component of csharpNativeCallableMemberComponents(member)) enqueue(component, memberBound, selected.depth + 1);
      }
    }
  }
}
