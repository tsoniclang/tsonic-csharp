import type { CsharpAcquiredRuntimeNativeDeclaration } from "../../model/runtime-policy.js";
import type { CsharpTargetAttributeFact, CsharpTargetAttributeValue, CsharpTargetMember } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { csharpNativeCallableMemberComponents, csharpTargetTypeComponents } from "../../../target-model/types/components.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";

export function csharpRuntimeNativeDeclarationReferences(declaration: CsharpAcquiredRuntimeNativeDeclaration): readonly string[] {
  const budget = createCsharpMetadataBudget();
  const definition = declaration.definition;
  const binding = declaration.binding;
  const pending: TargetTypeRef[] = [definition.carrier, ...definition.parameters, ...definition.supertypes];
  const values: CsharpTargetAttributeValue[] = [];
  const visited = new Set<TargetTypeRef>();
  const identities = new Set<string>();
  const attributes = (entries: readonly CsharpTargetAttributeFact[] | undefined): void => {
    for (const entry of entries ?? []) {
      budget.reserve(1);
      pending.push(entry.attributeType);
      for (const argument of entry.arguments ?? []) values.push(argument.value);
    }
  };
  const member = (entry: CsharpTargetMember): void => {
    if (entry.declaringType !== undefined) pending.push(entry.declaringType);
    if (entry.returnType !== undefined) pending.push(entry.returnType);
    for (const parameter of entry.parameters) {
      pending.push(parameter.type);
      attributes(parameter.attributes);
    }
    for (const parameter of entry.typeParameters ?? []) {
      for (const constraint of parameter.constraints ?? []) {
        if (constraint.kind === "implements") pending.push(constraint.contract);
      }
    }
    attributes(entry.attributes);
    attributes(entry.returnAttributes);
  };
  attributes(binding.attributes);
  if (binding.csharpBaseType !== undefined) pending.push(binding.csharpBaseType);
  for (const conversion of binding.conversionOperators ?? []) {
    pending.push(conversion.declaringType, conversion.sourceType, conversion.targetType);
  }
  for (const entry of definition.members) {
    member(entry.member);
    if (entry.kind === "callable") {
      pending.push(...csharpNativeCallableMemberComponents(entry.method));
      if (entry.value !== undefined) pending.push(...csharpNativeCallableMemberComponents(entry.value));
    } else if (entry.kind === "slot") {
      if (entry.storage !== undefined) pending.push(entry.storage.type);
      for (const access of [entry.read, entry.write]) {
        if (access === undefined) continue;
        member(access.member);
        pending.push(access.type);
      }
    }
  }
  while (values.length !== 0) {
    const value = values.pop()!;
    budget.reserve(1);
    if (value.kind === "type" || value.kind === "enum") pending.push(value.type);
    else if (value.kind === "array") values.push(...value.elements);
  }
  while (pending.length !== 0) {
    const type = pending.pop()!;
    if (visited.has(type)) continue;
    budget.reserve(1);
    visited.add(type);
    if (type.kind === "target-named") identities.add(type.id);
    pending.push(...csharpTargetTypeComponents(type));
  }
  return Object.freeze([...identities]);
}
