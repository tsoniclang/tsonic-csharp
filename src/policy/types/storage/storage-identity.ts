import type {
  TargetTypeRef,
} from "../model/definitions.js";

export function csharpTargetStorageIdentityEquals(
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "source-global":
      return right.kind === "source-global" &&
        left.name === right.name &&
        targetStorageListEquals(
          left.typeArguments ?? [],
          right.typeArguments ?? [],
        );
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetStorageListEquals(
          left.typeArguments ?? [],
          right.typeArguments ?? [],
        );
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        csharpTargetStorageIdentityEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" &&
        targetStorageListEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        csharpTargetStorageIdentityEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        stringListEquals(left.abi ?? [], right.abi ?? []) &&
        targetStorageListEquals(left.args, right.args) &&
        csharpTargetStorageIdentityEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        csharpTargetStorageIdentityEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        left.payloadId === right.payloadId;
  }
}

function targetStorageListEquals(
  left: readonly TargetTypeRef[],
  right: readonly TargetTypeRef[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) =>
      csharpTargetStorageIdentityEquals(item, right[index]!)
    );
}

function stringListEquals(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}
