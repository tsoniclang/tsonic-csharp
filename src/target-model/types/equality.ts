import type { TargetTypeRef } from "./model.js";

export function targetTypeRefEquals(
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
  if (isCsharpNullableReferenceTargetType(left) !== isCsharpNullableReferenceTargetType(right)) {
    return false;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.identity === right.identity;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" &&
        targetTypeRefListEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListEquals(left.args, right.args) &&
        targetTypeRefEquals(left.result, right.result) &&
        stringListEquals(left.abi ?? [], right.abi ?? []);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
  }
}

export function targetTypeRefIsClosed(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
    case "opaque":
      return true;
    case "type-parameter":
      return false;
    case "target-named":
      return (type.typeArguments ?? []).every(targetTypeRefIsClosed);
    case "array":
      return targetTypeRefIsClosed(type.element);
    case "tuple":
      return type.elements.every(targetTypeRefIsClosed);
    case "pointer":
      return targetTypeRefIsClosed(type.pointee);
    case "function-pointer":
      return targetTypeRefIsClosed(type.result) &&
        type.args.every(targetTypeRefIsClosed);
  }
}

const noBoundTypeParameters: ReadonlyMap<string, number> = new Map();

export function targetTypeRefKey(type: TargetTypeRef): string {
  return scopedTargetTypeRefKey(type, noBoundTypeParameters);
}

export function scopedTargetTypeRefKey(type: TargetTypeRef, boundParameters: ReadonlyMap<string, number>): string {
  const key = (child: TargetTypeRef): string => scopedTargetTypeRefKey(child, boundParameters);
  const nullablePrefix = isCsharpNullableReferenceTargetType(type)
    ? "nullable-reference:"
    : "";
  switch (type.kind) {
    case "source-primitive":
      return `${nullablePrefix}source:${type.name}`;
    case "target-named":
      return `${nullablePrefix}target:${type.id}<${(type.typeArguments ?? []).map(key).join(",")}>`;
    case "type-parameter":
      return boundParameters.has(type.identity)
        ? `${nullablePrefix}bound-type-parameter:${boundParameters.get(type.identity)}`
        : `${nullablePrefix}type-parameter:${type.identity}`;
    case "array":
      return `${nullablePrefix}array:${type.rank ?? 1}:${key(type.element)}`;
    case "tuple":
      return `${nullablePrefix}tuple:${type.elements.map(key).join(",")}`;
    case "pointer":
      return `${nullablePrefix}pointer:${type.mutability ?? ""}:${key(type.pointee)}`;
    case "function-pointer":
      return `${nullablePrefix}function-pointer:${(type.abi ?? []).join(",")}:${type.args.map(key).join(",")}=>${key(type.result)}`;
    case "opaque":
      return `${nullablePrefix}opaque:${type.id}`;
  }
}

function targetTypeRefListEquals(
  left: readonly TargetTypeRef[],
  right: readonly TargetTypeRef[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => targetTypeRefEquals(item, right[index]!));
}

function stringListEquals(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}

function isCsharpNullableReferenceTargetType(
  type: TargetTypeRef,
): boolean {
  return (type as { readonly csharpNullableReference?: unknown })
    .csharpNullableReference === true;
}
