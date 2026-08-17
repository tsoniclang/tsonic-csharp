import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpDelegateTargetType,
  getCsharpDelegateSignature,
  isCsharpVoidTargetType,
} from "../../policy/types/index.js";

export function objectShapeStorageMemberName(objectShape: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): string {
  if (member.memberKind !== "method") {
    return member.targetName;
  }
  if (!objectShape.members.some((candidate) => candidate === member)) {
    throw new Error("Object-shape storage member must belong to its object-shape fact.");
  }
  const memberIndex = objectShape.members.findIndex((candidate) => candidate === member);
  const baseName = `__tsonic_shape_method_${memberIndex}_${member.targetName}`;
  const reservedNames = new Set(objectShape.members.map((candidate) => candidate.targetName));
  let candidate = baseName;
  while (reservedNames.has(candidate)) {
    candidate = `_${candidate}`;
  }
  return candidate;
}

export function objectShapeMethodStorageTargetType(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): TargetTypeRef | undefined {
  if (member.memberKind !== "method") {
    return undefined;
  }
  const signature = getCsharpDelegateSignature(member.type);
  if (signature === undefined) {
    return undefined;
  }
  const parameters = [objectShape.targetType, ...signature.parameters];
  return isCsharpVoidTargetType(signature.returnType)
    ? csharpDelegateTargetType("System.Action", parameters)
    : csharpDelegateTargetType("System.Func", parameters, signature.returnType);
}

export function objectShapeAccessorGetterStorageMemberName(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): string {
  return objectShapeSyntheticStorageMemberName(
    objectShape,
    member,
    "accessor_getter",
  );
}

export function objectShapeAccessorSetterStorageMemberName(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): string {
  return objectShapeSyntheticStorageMemberName(
    objectShape,
    member,
    "accessor_setter",
  );
}

function objectShapeSyntheticStorageMemberName(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  role: string,
): string {
  if (!objectShape.members.some((candidate) => candidate === member)) {
    throw new Error("Object-shape storage member must belong to its object-shape fact.");
  }
  const memberIndex = objectShape.members.findIndex((candidate) => candidate === member);
  const baseName = `__tsonic_shape_${role}_${memberIndex}_${member.targetName}`;
  const reservedNames = new Set(objectShape.members.map((candidate) => candidate.targetName));
  let candidate = baseName;
  while (reservedNames.has(candidate)) {
    candidate = `_${candidate}`;
  }
  return candidate;
}
