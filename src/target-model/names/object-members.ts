import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../types/model.js";

export const csharpJsonValueWriterMethodName = "__tsonicWriteJson";
export const csharpJsonValueProjectionMethodName = "__tsonicJsonValue";
export const csharpEnumerableKeysMethodName = "__tsonicObjectEnumerableKeys";
export const csharpEnumerableKeysStorageName = "__tsonicObjectEnumerableKeyStorage";

export function csharpDeferredCaptureStorageNames(name: string): { readonly valueName: string; readonly initializedName: string } {
  return { valueName: `${name}Value`, initializedName: `${name}Initialized` };
}

export function csharpFrozenStorageName(shape: CsharpObjectShapeFact, name: string): string {
  const reserved = new Set(shape.members.map(member => objectShapeStorageMemberName(shape, member)));
  let candidate = `__tsonic_frozen_${name}`;
  while (reserved.has(candidate)) candidate = `_${candidate}`;
  return candidate;
}

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

export function objectShapeBoundStorageMemberName(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): string {
  return objectShapeSyntheticStorageMemberName(objectShape, member, "bound_field");
}

export function objectShapeMethodBodyName(objectShape: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): string {
  return objectShapeSyntheticStorageMemberName(objectShape, member, "method_body");
}

export function objectShapeMethodInvocationName(member: CsharpObjectShapeMemberFact): string {
  return `__tsonic_invoke_body_${member.targetName}`;
}

export function objectShapeMethodValueStorageNames(objectShape: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): {
  readonly name: string;
  readonly valueName: string;
  readonly initializedName: string;
} {
  return {
    name: objectShapeStorageMemberName(objectShape, member),
    valueName: objectShapeSyntheticStorageMemberName(objectShape, member, "method_value"),
    initializedName: objectShapeSyntheticStorageMemberName(objectShape, member, "method_initialized"),
  };
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
