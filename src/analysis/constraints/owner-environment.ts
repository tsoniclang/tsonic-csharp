import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

import { snapshotCsharpTargetTypes } from "../../target-model/types/snapshot.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../target-model/types/generic-constraints.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
const noTypeParameters: readonly TypeParameter[] = Object.freeze([]);

import type { CsharpTypeParameterConstraintResolver } from "../../target-model/types/generic-references.js";

import { visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
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
      if (constraint.kind === "type") visitCsharpTargetTypeParameters(constraint.type, enqueue, budget);
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
    visitCsharpTargetTypeParameters(type, parameter => {
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
