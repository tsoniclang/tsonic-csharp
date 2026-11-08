import type { TargetTypeRef } from "./native-type-data.js";
import type { CsharpNativeCallableMember, CsharpObjectShapeFact, CsharpRuntimeUnionTargetTypeRef, CsharpTargetNamedTypeRef } from "./model.js";
import { createCsharpMetadataBudget } from "../metadata/immutable.js";
import { csharpOptionalStorageDefinitionNames } from "./native-generics.js";

export function csharpTargetTypeComponents(
  type: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
  includeSignatureLocalTypes = true,
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
    case "type-parameter":
      addAll(type.csharpRequirementDependencies);
      addAll(type.csharpProjection?.arguments);
      if (includeSignatureLocalTypes && type.csharpProjection !== undefined) {
        for (const name of csharpOptionalStorageDefinitionNames) add(type.csharpProjection.definitions[name].carrier);
      }
      if (type.csharpConstraints?.kind === "resolved") {
        budget.reserve(type.csharpConstraints.constraints.length);
        for (const constraint of type.csharpConstraints.constraints) {
          if (constraint.kind === "type") add(constraint.type);
        }
      }
      break;
    case "source-primitive":
    case "opaque":
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
    if (includeSignatureLocalTypes) add(target.csharpMethodValue?.contract);
    add(target.csharpClassFactory?.instance);
    add(target.csharpTaskResultType);
    add(target.csharpGeneratorProtocol?.yieldType);
    add(target.csharpGeneratorProtocol?.returnType);
    add(target.csharpGeneratorProtocol?.nextType);
    add(target.csharpIteratorResultProtocol?.yieldType);
    add(target.csharpIteratorResultProtocol?.returnType);
    addAll(target.csharpDelegateSignature?.parameters);
    add(target.csharpDelegateSignature?.receiver?.type);
    add(target.csharpExpressionTreeDelegateType);
    add(target.csharpDelegateSignature?.returnType);
    if (includeSignatureLocalTypes) for (const member of target.csharpCallableMembers ?? []) addAll(csharpNativeCallableMemberComponents(member));
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
      add(member.methodValueStorage?.type);
      if (includeSignatureLocalTypes && member.memberKind === "method") {
        budget.reserve(member.methods.length);
        for (const method of member.methods) {
          addAll(csharpNativeCallableMemberComponents(method.member));
          addAll(csharpNativeCallableMemberComponents(method.value));
        }
      }
    }
    budget.reserve(shape.methodImplementation?.captures.length ?? 0);
    for (const capture of shape.methodImplementation?.captures ?? []) add(capture.type);
    addAll(shape.implements);
  }
}

export function csharpNativeCallableMemberComponents(member: CsharpNativeCallableMember): readonly TargetTypeRef[] {
  const budget = createCsharpMetadataBudget();
  budget.reserve(member.signature.parameters.length + member.typeParameters.length + 2);
  const values = [...member.signature.parameters, member.signature.returnType];
  if (member.signature.receiver !== undefined) values.push(member.signature.receiver.type);
  for (const parameter of member.typeParameters) {
    budget.reserve(parameter.constraints.length);
    for (const constraint of parameter.constraints) if (constraint.kind === "type") values.push(constraint.type);
  }
  return Object.freeze(values);
}
