import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  isCsharpNullableReferenceTargetType,
} from "../storage/nullable.js";

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
    case "source-global":
      return right.kind === "source-global" &&
        left.name === right.name &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
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
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        left.payloadId === right.payloadId;
  }
}

export function targetTypeRefIsClosed(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return true;
    case "type-parameter":
      return false;
    case "source-global":
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
    case "associated-type":
      return targetTypeRefIsClosed(type.owner);
  }
}

export function targetTypeRefKey(type: TargetTypeRef): string {
  const nullablePrefix = isCsharpNullableReferenceTargetType(type)
    ? "nullable-reference:"
    : "";
  switch (type.kind) {
    case "source-primitive":
      return `${nullablePrefix}source:${type.name}`;
    case "source-global":
      return `${nullablePrefix}source-global:${type.name}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "target-named":
      return `${nullablePrefix}target:${type.id}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "type-parameter":
      return `${nullablePrefix}type-parameter:${type.name}`;
    case "array":
      return `${nullablePrefix}array:${type.rank ?? 1}:${targetTypeRefKey(type.element)}`;
    case "tuple":
      return `${nullablePrefix}tuple:${type.elements.map(targetTypeRefKey).join(",")}`;
    case "pointer":
      return `${nullablePrefix}pointer:${type.mutability ?? ""}:${targetTypeRefKey(type.pointee)}`;
    case "function-pointer":
      return `${nullablePrefix}function-pointer:${(type.abi ?? []).join(",")}:${type.args.map(targetTypeRefKey).join(",")}=>${targetTypeRefKey(type.result)}`;
    case "opaque":
      return `${nullablePrefix}opaque:${type.id}`;
    case "associated-type":
      return `${nullablePrefix}associated:${type.name}:${targetTypeRefKey(type.owner)}`;
    case "lifetime":
      return `${nullablePrefix}lifetime:${type.name}`;
    case "target-specific":
      return `${nullablePrefix}target-specific:${type.target}:${type.name}:${type.payloadId ?? ""}`;
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
