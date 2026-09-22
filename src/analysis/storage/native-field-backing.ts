import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpObjectShapeMemberContractKey, csharpStructuralObjectShapeIdentity } from "../../target-model/types/object-shape-identity.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpNativeMemoryLayoutsEqual, type CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import type { CsharpNativeObjectField } from "./model.js";
import { createStructuralObjectShapeTarget } from "../../policy/types/objects/object-shape-policy/construction.js";

export function createCsharpNativeFieldBacking(shapes: readonly CsharpObjectShapeFact[]) {
  const fields = new Map<string, CsharpNativeObjectField>();
  const closedContracts = new Map<string, TargetTypeRef>();
  const dependents = new Map<string, { readonly base: TargetTypeRef; readonly shape: CsharpObjectShapeFact }[]>();
  const usedNames = new Set(shapes.flatMap(shape => shape.members.map(member => member.targetName)));
  const storageNames = new Map<string, string>();
  const fieldKey = (owner: TargetTypeRef, name: string): string => JSON.stringify([targetTypeRefKey(owner), name]);
  for (const shape of shapes) {
    for (const base of shape.implements ?? []) {
      const key = targetTypeRefKey(base);
      const edges = dependents.get(key) ?? [];
      edges.push({ base, shape });
      dependents.set(key, edges);
    }
  }
  return Object.freeze({
    values: () => Object.freeze([...fields.values()]),
    closedContracts: () => Object.freeze([...closedContracts.values()]),
    get: (owner: TargetTypeRef, name: string) => fields.get(fieldKey(owner, name)),
    select(root: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact, layout: CsharpNativeMemoryLayout):
      { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly reason: string } {
      const memberKey = csharpObjectShapeMemberContractKey(member);
      const pending = [root];
      const visited = new Set<string>();
      const selected: CsharpObjectShapeFact[] = [];
      for (let index = 0; index < pending.length; index++) {
        const shape = pending[index]!;
        const key = targetTypeRefKey(shape.targetType);
        if (visited.has(key)) continue;
        visited.add(key);
        const matches = shape.members.filter(candidate => csharpObjectShapeMemberContractKey(candidate) === memberKey);
        const field = matches.length === 1 ? matches[0] : undefined;
        if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined ||
          field === undefined || field.readonly === true || field.bound === true || field.optional === true ||
          field.accessor !== undefined || field.memberKind !== "property" || !targetTypeRefEquals(field.type, layout.pointeeType)) {
          return { kind: "rejected", reason: "Every implementation of a native-backed field must retain its exact mutable data-property contract." };
        }
        const previous = fields.get(fieldKey(shape.targetType, member.targetName));
        if (previous !== undefined && !csharpNativeMemoryLayoutsEqual(previous.layout, layout)) {
          return { kind: "rejected", reason: "One exact object field has incompatible native layout requirements." };
        }
        selected.push(shape);
        for (const edge of dependents.get(key) ?? []) {
          if (targetTypeRefEquals(edge.base, shape.targetType)) pending.push(edge.shape);
        }
      }
      let storageName = storageNames.get(memberKey);
      if (storageName === undefined) {
        const base = `${member.targetName}Location`;
        storageName = base;
        for (let suffix = 2; usedNames.has(storageName); suffix++) storageName = `${base}_${suffix}`;
        usedNames.add(storageName);
        storageNames.set(memberKey, storageName);
      }
      for (const shape of selected) {
        if (shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true) {
          const contract = createStructuralObjectShapeTarget(shape.members, shape.implements, true);
          closedContracts.set(targetTypeRefKey(contract), contract);
        }
        fields.set(fieldKey(shape.targetType, member.targetName), Object.freeze({
          owner: shape.targetType, memberName: member.targetName, storageName, layout,
        }));
      }
      return { kind: "resolved" };
    },
  });
}
