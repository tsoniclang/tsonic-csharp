import type {
  CsharpObjectShapeFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./model.js";
import { createCsharpMetadataBudget } from "../metadata/immutable.js";

export function csharpTargetTypeComponents(
  type: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
): readonly TargetTypeRef[] {
  const components: TargetTypeRef[] = [];
  const budget = createCsharpMetadataBudget();
  const add = (type: TargetTypeRef | undefined): void => {
    if (type !== undefined) {
      budget.reserve(1);
      components.push(type);
    }
  };
  const addAll = (types: readonly TargetTypeRef[] | undefined): void => {
    if (types === undefined) return;
    budget.reserve(types.length);
    for (const type of types) components.push(type);
  };
  switch (type.kind) {
    case "source-global":
    case "target-named":
      addAll(type.typeArguments);
      break;
    case "array":
      add(type.element);
      break;
    case "tuple":
      addAll(type.elements);
      break;
    case "pointer":
      add(type.pointee);
      break;
    case "function-pointer":
      addAll(type.args);
      add(type.result);
      break;
    case "associated-type":
      add(type.owner);
      break;
    case "type-parameter":
      addAll(type.csharpProjection?.arguments);
      if (type.csharpConstraints?.kind === "resolved") {
        budget.reserve(type.csharpConstraints.constraints.length);
        for (const constraint of type.csharpConstraints.constraints) {
          if (constraint.kind === "type") add(constraint.type);
        }
      }
      break;
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      break;
  }
  if (type.kind === "target-named") {
    const target = type as CsharpTargetNamedTypeRef;
    add(target.csharpArrayLiteralElementType);
    add(target.csharpArrayLiteralConstructionType);
    add(target.csharpImplicitArrayInputElementType);
    add(target.csharpEnumerableElementType);
    add(target.csharpArrayLikeElementType);
    add(target.csharpReadOnlyIndexableElementType);
    add(target.csharpDenseMutableElementType);
    const indexedRead = target.csharpIndexableReadMember;
    if (indexedRead !== undefined) {
      add(indexedRead.declaringType);
      add(indexedRead.returnType);
      budget.reserve(indexedRead.parameters.length);
      for (const parameter of indexedRead.parameters) add(parameter.type);
    }
    add(target.csharpBaseType);
    add(target.csharpMethodValue?.owner);
    add(target.csharpMethodValue?.contract);
    add(target.csharpClassFactory?.instance);
    add(target.csharpTaskResultType);
    add(target.csharpGeneratorProtocol?.yieldType);
    add(target.csharpGeneratorProtocol?.returnType);
    add(target.csharpGeneratorProtocol?.nextType);
    add(target.csharpIteratorResultProtocol?.yieldType);
    add(target.csharpIteratorResultProtocol?.returnType);
    addAll(target.csharpDelegateSignature?.parameters);
    add(target.csharpDelegateSignature?.returnType);
    const union = target as Partial<CsharpRuntimeUnionTargetTypeRef>;
    addAll(union.csharpRuntimeUnionArms);
    budget.reserve(union.csharpRuntimeUnionObjectShapes?.length ?? 0);
    for (const shape of union.csharpRuntimeUnionObjectShapes ?? []) {
      addObjectShapeComponents(shape);
    }
  }
  addObjectShapeComponents(objectShape);
  return Object.freeze([...new Set(components)]);

  function addObjectShapeComponents(shape: CsharpObjectShapeFact | undefined): void {
    if (shape === undefined) return;
    budget.reserve(shape.members.length);
    for (const member of shape.members) {
      add(member.type);
      add(member.methodStorageType);
      add(member.methodValueContract);
      budget.reserve(member.typeParameters?.length ?? 0);
      for (const parameter of member.typeParameters ?? []) {
        budget.reserve(parameter.constraints.length);
        for (const constraint of parameter.constraints) if (constraint.kind === "type") add(constraint.type);
      }
    }
    budget.reserve(shape.methodImplementation?.captures.length ?? 0);
    for (const capture of shape.methodImplementation?.captures ?? []) add(capture.type);
    addAll(shape.implements);
  }
}
