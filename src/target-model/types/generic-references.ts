import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { targetTypeRefKey } from "./equality.js";
import { csharpTargetTypeComponents } from "./components.js";
import { csharpTypeProjection } from "./projections.js";
import { snapshotCsharpTargetTypes } from "./snapshot.js";
import { createCsharpMetadataBudget } from "../metadata/immutable.js";
import { csharpTypeParameterConstraintResolutionKey, type CsharpTypeParameterConstraintResolution } from "../declarations/generic-constraints.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
type TraversalBudget = ReturnType<typeof createCsharpMetadataBudget>;
const noTypeParameters: readonly TypeParameter[] = Object.freeze([]);

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

export function visitCsharpTargetTypeParameters(type: TargetTypeRef, visit: (parameter: TypeParameter) => void): void {
  walkTypeParameters(type, visit, createCsharpMetadataBudget());
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
      case "source-global":
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
      case "associated-type": enqueue(type.owner, selected.depth + 1); break;
      case "source-primitive":
      case "opaque":
      case "lifetime":
      case "target-specific": break;
    }
  }
}

export function closeCsharpOwnerTypeParameterEnvironment(
  parameters: readonly TypeParameter[],
  resolve: CsharpTypeParameterConstraintResolver,
): readonly TypeParameter[] {
  if (parameters.length === 0) return noTypeParameters;
  const budget = createCsharpMetadataBudget();
  budget.reserve(parameters.length);
  const pending: TypeParameter[] = [];
  const selected = new Map<string, TypeParameter>();
  const enqueue = (parameter: TypeParameter): void => {
    budget.reserve(1);
    const resolution = resolve(parameter);
    const finalized = snapshotCsharpTargetTypes([{ ...parameter, csharpConstraints: resolution }], budget)[0]!;
    if (finalized.kind !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    const previous = selected.get(parameter.identity);
    if (previous !== undefined) {
      if (csharpTypeParameterConstraintResolutionKey(previous.csharpConstraints) !==
          csharpTypeParameterConstraintResolutionKey(finalized.csharpConstraints)) {
        throw new TypeError("A native generic binder has conflicting constraint evidence.");
      }
      return;
    }
    selected.set(parameter.identity, finalized);
    pending.push(finalized);
  };
  for (const parameter of snapshotCsharpTargetTypes(parameters, budget)) {
    if (parameter.kind !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    enqueue(parameter);
  }
  for (let index = 0; index < pending.length; index += 1) {
    const constraints = pending[index]!.csharpConstraints;
    if (constraints?.kind !== "resolved") continue;
    budget.reserve(constraints.constraints.length);
    for (const constraint of constraints.constraints) {
      if (constraint.kind === "type") walkTypeParameters(constraint.type, enqueue, budget);
    }
  }
  return Object.freeze([...selected.values()].sort((left, right) => targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))));
}

export function csharpObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): readonly TypeParameter[] {
  const budget = createCsharpMetadataBudget();
  budget.reserve(members.length + (implemented?.length ?? 0) + (implementation?.captures.length ?? 0));
  const parameters = new Map<string, TypeParameter>();
  const collect = (type: TargetTypeRef, bound?: ReadonlySet<string>): void => {
    walkTypeParameters(type, parameter => {
      if (bound?.has(parameter.identity) === true) return;
      const previous = parameters.get(parameter.identity);
      if (previous?.csharpConstraints !== undefined && parameter.csharpConstraints !== undefined &&
          csharpTypeParameterConstraintResolutionKey(previous.csharpConstraints) !==
          csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints)) {
        throw new TypeError("A native generic binder has conflicting constraint evidence.");
      }
      if (previous?.csharpConstraints === undefined) parameters.set(parameter.identity, parameter);
    }, budget);
  };
  for (const member of members) {
    budget.reserve(member.typeParameters?.length ?? 0);
    const bound = new Set(member.typeParameters?.map(parameter => parameter.identity));
    collect(member.type, bound);
    if (member.methodStorageType !== undefined) collect(member.methodStorageType);
    for (const parameter of member.typeParameters ?? []) {
      budget.reserve(parameter.constraints.length);
      for (const constraint of parameter.constraints) if (constraint.kind === "type") collect(constraint.type, bound);
    }
  }
  for (const type of implemented ?? []) collect(type);
  for (const capture of implementation?.captures ?? []) collect(capture.type);
  return Object.freeze([...parameters.values()].sort((left, right) => targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))));
}
