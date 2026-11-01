import type { CsharpObjectShapeDemandScope } from "./batches.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/index.js";
import { isCsharpValueTypeTargetType, targetTypeRefEquals, targetTypeRefKey, isSourceDeclaredNominalShape } from "../../../target-model/types/index.js";
import { objectShapeArtifactKey } from "../../../target-model/records/objects/object-shape-keys.js";
import { maximumArtifactCount } from "./batches.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";

export function collectCsharpReferenceClosure(
  scope: CsharpObjectShapeDemandScope,
  type: TargetTypeRef,
  preferred: CsharpObjectShapeFact | undefined,
  pending: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: "reference-identity" | "method-values" | "enumerable-keys",
): { readonly kind: "accepted"; readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact> }
  | { readonly kind: "rejected"; readonly reason: string } {
  const root = preferred ?? scope.host.objectShapes.resolveTarget(type);
  if (root === undefined) return { kind: "rejected", reason: `The ${capability} capability requires a closed reference-object shape.` };
  const shapes = new Map<string, CsharpObjectShapeFact>();
  const visible = scope.visibleObjectShapes(pending);
  const dependents = new Map<string, { readonly base: TargetTypeRef; readonly shape: CsharpObjectShapeFact }[]>();
  for (const shape of visible) {
    for (const base of shape.implements ?? []) {
      const key = targetTypeRefKey(base);
      const edges = dependents.get(key) ?? [];
      edges.push({ base, shape });
      dependents.set(key, edges);
    }
  }
  const work = [root];
  const queued = new Set([objectShapeArtifactKey(root)]);
  const memberTypes: TargetTypeRef[] = [];
  const checkedMemberTypes = new Set<string>();
  const enqueue = (shape: CsharpObjectShapeFact): void => {
    const key = objectShapeArtifactKey(shape);
    if (queued.has(key)) return;
    queued.add(key);
    work.push(shape);
  };
  for (let index = 0, memberIndex = 0; index < work.length || memberIndex < memberTypes.length;) {
    if (index >= work.length) {
      const type = memberTypes[memberIndex++]!;
      const key = targetTypeRefKey(type);
      if (checkedMemberTypes.has(key)) continue;
      if (checkedMemberTypes.size >= maximumArtifactCount) return { kind: "rejected",
        reason: `The ${capability} reference closure exceeds its finite ${maximumArtifactCount}-shape budget.` };
      checkedMemberTypes.add(key);
      const present = getCsharpNullableElementTargetType(type) ?? type;
      const shape = scope.host.objectShapes.resolveTarget(present);
      if (shape !== undefined && !isCsharpValueTypeTargetType(shape.targetType)) enqueue(shape);
      else {
        const element = getCsharpCollectionElementTargetType(present);
        if (element !== undefined) memberTypes.push(element);
        if (present.kind === "tuple") memberTypes.push(...present.elements);
        memberTypes.push(...getCsharpRuntimeUnionArms(present, scope.host.typeDefinitions) ?? []);
      }
      continue;
    }
    const shape = work[index++]!;
    const key = objectShapeArtifactKey(shape);
    if (shapes.has(key)) continue;
    if (shapes.size >= maximumArtifactCount) {
      return { kind: "rejected", reason: `The ${capability} reference closure exceeds its finite ${maximumArtifactCount}-shape budget.` };
    }
    if (capability === "method-values" && isSourceDeclaredNominalShape(shape) &&
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") {
      return { kind: "rejected", reason: "Copying method values requires exact own callable storage, not a nominal prototype method." };
    }
    if (capability === "enumerable-keys" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true) {
      const order = scope.host.objectShapes.propertyOrder(shape, undefined, "keys");
      if (order.kind === "rejected") return order;
    }
    if (isCsharpValueTypeTargetType(shape.targetType)) {
      return { kind: "rejected", reason: `The ${capability} capability cannot use native value storage.` };
    }
    shapes.set(key, shape);
    if (capability === "reference-identity") memberTypes.push(...shape.members.map(member => member.methodValueStorage?.type ?? member.type));
    if (capability === "method-values" || capability === "reference-identity" && shape.methodImplementation !== undefined) {
      if (shape.declarationTemplate !== undefined) enqueue(shape.declarationTemplate);
      for (const member of shape.members) {
        if (member.methodValueContract === undefined) continue;
        const contract = scope.host.objectShapes.resolveTarget(member.methodValueContract);
        if (contract === undefined) return { kind: "rejected", reason: "A generic method value requires its sealed native callable contract." };
        enqueue(contract);
      }
    }
    for (const dependent of dependents.get(targetTypeRefKey(shape.targetType)) ?? []) {
      if (targetTypeRefEquals(dependent.base, shape.targetType)) enqueue(dependent.shape);
    }
  }
  return { kind: "accepted", shapes };
}
