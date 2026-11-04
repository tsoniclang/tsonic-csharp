import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpConversionShapeQueries } from "../../conversions/shape-queries.js";
import { csharpProviderBindingFromResolution } from "../../../providers/model/relation-resolver.js";
import { csharpTargetBindingFact } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpEnumerableTargetType, csharpReadOnlyListTargetType, getCsharpCollectionElementTargetType, getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveDotnetMetadataName } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpBaseTargetTypeFromBinding } from "../storage/bindings.js";
import { targetBindingSubstitutions } from "../../conversions/provider-operators.js";
import { implementedConstraintType } from "../../conversions/carriers.js";

export type CsharpSourceTypeFlowRelationHost = Pick<CsharpPolicyContext, "projectTypes" | "providers"> & CsharpConversionShapeQueries;

export function csharpSourceTypeFlowInterfaceAccepts(
  host: CsharpSourceTypeFlowRelationHost,
  source: TargetTypeRef,
  required: TargetTypeRef,
): boolean {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const requiredElement = getCsharpNullableElementTargetType(required);
  if (sourceElement !== undefined && requiredElement === undefined) return false;
  const target = requiredElement ?? required;
  const pending = [sourceElement ?? source];
  const visited = new Set<string>();
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]!;
    if (targetTypeRefEquals(current, target)) return true;
    const key = targetTypeRefKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    const element = getCsharpCollectionElementTargetType(current);
    const vector = current.kind !== "array" || (current.rank ?? 1) === 1;
    if (vector && element !== undefined && targetTypeRefEquals(target, csharpEnumerableTargetType(element))) return true;
    if (vector && (current.kind === "array" || getCsharpJsArrayElementTargetType(current) !== undefined) && element !== undefined &&
      targetTypeRefEquals(target, csharpReadOnlyListTargetType(element))) return true;
    const shape = host.objectShapes?.resolveTarget(current);
    if (shape !== undefined && targetTypeRefEquals(shape.targetType, current)) pending.push(...shape.implements ?? []);
    if (current.kind === "type-parameter") {
      if (current.csharpConstraints?.kind === "resolved") {
        for (const constraint of current.csharpConstraints.constraints) if (constraint.kind === "type") pending.push(constraint.type);
      }
      continue;
    }
    if (current.kind === "target-named") {
      pending.push(...host.projectTypes.directSupertypes(current) ?? []);
      const named: CsharpTargetNamedTypeRef = current;
      if (named.csharpBaseType !== undefined) pending.push(named.csharpBaseType);
    }
    const resolution = current.kind === "target-named"
      ? host.providers.findTargetBindingByTargetId(current.id, "ordinary")
      : current.kind === "source-primitive"
        ? host.providers.findTargetBindingByMetadataName(csharpSourcePrimitiveDotnetMetadataName(current.name), "ordinary")
        : undefined;
    if (resolution === undefined) continue;
    const binding = csharpTargetBindingFact(csharpProviderBindingFromResolution(resolution));
    if (binding === undefined) continue;
    const arguments_ = current.kind === "target-named" ? current.typeArguments ?? [] : [];
    if ((binding.typeParameters?.length ?? 0) !== arguments_.length) continue;
    const substitutions = targetBindingSubstitutions(binding, arguments_);
    const base = csharpBaseTargetTypeFromBinding(binding, arguments_);
    if (base !== undefined) pending.push(base);
    for (const constraint of binding.implementedContracts ?? []) {
      if (constraint.kind !== "implements") continue;
      const contract = implementedConstraintType(host, constraint, substitutions);
      if (contract !== undefined) pending.push(contract);
    }
  }
  return false;
}
