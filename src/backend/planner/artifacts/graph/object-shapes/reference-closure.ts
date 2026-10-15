import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../../target-model/types/index.js";
import { isCsharpValueTypeTargetType, targetTypeRefEquals, targetTypeRefKey, isSourceDeclaredNominalShape } from "../../../../../target-model/types/index.js";
import { objectShapeArtifactKey } from "./identity.js";
import { maximumArtifactCount } from "../model.js";
import { resolveCsharpSourceClassStorage } from "./native-storage.js";

export function collectCsharpReferenceClosure(
  scope: CsharpArtifactGraphScope,
  type: TargetTypeRef,
  preferred: CsharpObjectShapeFact | undefined,
  pending: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: "js-freeze" | "reference-identity" | "method-values" | "enumerable-keys",
): { readonly kind: "accepted"; readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact> }
  | { readonly kind: "rejected"; readonly reason: string } {
  const root = preferred ?? scope.host.objectShapes.resolveTarget(type);
  if (root === undefined) return { kind: "rejected", reason: `The ${capability} capability requires a closed reference-object shape.` };
  const shapes = new Map<string, CsharpObjectShapeFact>();
  const visible = scope.visibleObjectShapes(pending);
  const dependents = new Map<string, { readonly base: TargetTypeRef; readonly shape: CsharpObjectShapeFact }[]>();
  for (const shape of visible) {
    const nativeBase = capability === "js-freeze"
      ? resolveCsharpSourceClassStorage(scope, shape.targetType)?.baseType : undefined;
    const nativeOwner = nativeBase === undefined ? undefined
      : resolveCsharpSourceClassStorage(scope, nativeBase)?.declaration.targetType;
    for (const base of [...shape.implements ?? [], ...(nativeBase === undefined ? [] : [nativeBase]),
      ...(nativeOwner === undefined ? [] : [nativeOwner])]) {
      const key = targetTypeRefKey(base);
      const edges = dependents.get(key) ?? [];
      edges.push({ base, shape });
      dependents.set(key, edges);
    }
  }
  const work = [root];
  const queued = new Set([objectShapeArtifactKey(root)]);
  const enqueue = (shape: CsharpObjectShapeFact): void => {
    const key = objectShapeArtifactKey(shape);
    if (queued.has(key)) return;
    queued.add(key);
    work.push(shape);
  };
  for (let index = 0; index < work.length; index++) {
    const shape = work[index]!;
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
    if (isCsharpValueTypeTargetType(shape.targetType) || capability === "js-freeze" && shape.members.some(member => member.bound === true)) {
      return { kind: "rejected", reason: `The ${capability} capability cannot use native value storage or an unprotected bound write route.` };
    }
    shapes.set(key, shape);
    if (capability === "js-freeze" && shape.targetType.kind === "target-named" &&
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class") {
      const storage = resolveCsharpSourceClassStorage(scope, shape.targetType);
      if (storage === undefined) {
        return { kind: "rejected", reason: "A frozen source class requires its exact sealed declaration and native storage heritage." };
      }
      enqueue(storage.declaration);
      if (storage.baseType !== undefined) {
        const base = scope.host.objectShapes.resolveTarget(storage.baseType);
        if (base?.targetType.kind !== "target-named" ||
          (base.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "class" ||
          !targetTypeRefEquals(base.targetType, storage.baseType)) {
          return { kind: "rejected", reason: "A frozen source class requires closed source-owned native base-field storage." };
        }
        enqueue(base);
      }
    }
    if (capability === "method-values") {
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
