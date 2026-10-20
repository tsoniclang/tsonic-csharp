import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";

import { csharpTargetTypeComponents } from "./components.js";
import { csharpTypeProjection } from "./projections.js";

import { createCsharpMetadataBudget } from "../metadata/immutable.js";
import { type CsharpTypeParameterConstraintResolution } from "./generic-constraints.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
type TraversalBudget = ReturnType<typeof createCsharpMetadataBudget>;

export type CsharpTypeParameterConstraintResolver =
  (parameter: TypeParameter) => CsharpTypeParameterConstraintResolution;

export function csharpFreeTypeParameterIdentities(types: readonly TargetTypeRef[]): ReadonlySet<string> {
  const budget = createCsharpMetadataBudget();
  budget.reserve(types.length);
  const identities = new Set<string>();
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
    const projection = csharpTypeProjection(type);
    if (projection !== undefined) {
      for (const argument of projection.csharpProjection.arguments) enqueue(argument, bound, selected.depth + 1);
    } else if (type.kind === "type-parameter") {
      if (!bound.has(type.identity)) identities.add(type.identity);
    } else {
      const method = type.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue : undefined;
      for (const component of csharpTargetTypeComponents(type)) {
        if (component !== method?.contract) enqueue(component, bound, selected.depth + 1);
      }
      if (method !== undefined) {
        budget.reserve(bound.size + method.typeParameters.length);
        enqueue(method.contract, new Set([...bound, ...method.typeParameters]), selected.depth + 1);
      }
    }
  }
  return identities;
}

export function visitCsharpTargetTypeParameters(type: TargetTypeRef, visit: (parameter: TypeParameter) => void, budget = createCsharpMetadataBudget()): void {
  walkTypeParameters(type, visit, budget);
}

function walkTypeParameters(type: TargetTypeRef, visit: (parameter: TypeParameter) => void, budget: TraversalBudget): void {
  const pending: { readonly type: TargetTypeRef; readonly depth: number }[] = [];
  const visited = new Set<TargetTypeRef>();
  const enqueue = (type: TargetTypeRef, depth: number): void => {
    budget.reserve(1, depth);
    pending.push({ type, depth });
  };
  enqueue(type, 0);
  for (let index = 0; index < pending.length; index += 1) {
    const selected = pending[index]!;
    const type = selected.type;
    if (visited.has(type)) continue;
    visited.add(type);
    switch (type.kind) {
      case "type-parameter": visit(type); break;
      case "target-named":
        for (const argument of type.typeArguments ?? []) enqueue(argument, selected.depth + 1);
        break;
      case "array": enqueue(type.element, selected.depth + 1); break;
      case "tuple":
        for (const element of type.elements) enqueue(element, selected.depth + 1);
        break;
      case "pointer": enqueue(type.pointee, selected.depth + 1); break;
      case "function-pointer":
        for (const argument of type.args) enqueue(argument, selected.depth + 1);
        enqueue(type.result, selected.depth + 1);
        break;
      case "source-primitive":
      case "opaque":
        break;
    }
  }
}
