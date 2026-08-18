import type {
  CsharpObjectShapeFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  targetTypeRefKey,
} from "./equality.js";

export function csharpTargetTypeComponents(
  type: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
): readonly TargetTypeRef[] {
  const components: TargetTypeRef[] = [];
  switch (type.kind) {
    case "source-global":
    case "target-named":
      components.push(...type.typeArguments ?? []);
      break;
    case "array":
      components.push(type.element);
      break;
    case "tuple":
      components.push(...type.elements);
      break;
    case "pointer":
      components.push(type.pointee);
      break;
    case "function-pointer":
      components.push(...type.args, type.result);
      break;
    case "associated-type":
      components.push(type.owner);
      break;
    case "source-primitive":
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      break;
  }
  if (type.kind === "target-named") {
    const target = type as CsharpTargetNamedTypeRef;
    addDefined(components, target.csharpArrayLiteralElementType);
    addDefined(components, target.csharpArrayLiteralConstructionType);
    addDefined(components, target.csharpImplicitArrayInputElementType);
    addDefined(components, target.csharpEnumerableElementType);
    addDefined(components, target.csharpReadOnlyIndexableElementType);
    addDefined(components, target.csharpDenseMutableElementType);
    addDefined(components, target.csharpBaseType);
    addDefined(components, target.csharpTaskResultType);
    components.push(...target.csharpDelegateSignature?.parameters ?? []);
    addDefined(components, target.csharpDelegateSignature?.returnType);
    const union = target as Partial<CsharpRuntimeUnionTargetTypeRef>;
    components.push(...union.csharpRuntimeUnionArms ?? []);
    for (const shape of union.csharpRuntimeUnionObjectShapes ?? []) {
      addObjectShapeComponents(components, shape);
    }
  }
  addObjectShapeComponents(components, objectShape);
  const unique = new Map<string, TargetTypeRef>();
  for (const component of components) {
    unique.set(targetTypeRefKey(component), component);
  }
  return Object.freeze([...unique.values()]);
}

function addDefined(
  components: TargetTypeRef[],
  type: TargetTypeRef | undefined,
): void {
  if (type !== undefined) {
    components.push(type);
  }
}

function addObjectShapeComponents(
  components: TargetTypeRef[],
  shape: CsharpObjectShapeFact | undefined,
): void {
  if (shape === undefined) {
    return;
  }
  components.push(...shape.members.map((member) => member.type));
  components.push(...shape.implements ?? []);
}
