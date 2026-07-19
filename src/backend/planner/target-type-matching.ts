import type { TargetTypeRef } from "@tsonic/tsts";
import {
  isCsharpNullableReferenceTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export function targetTypeRefsMatch(left: TargetTypeRef, right: TargetTypeRef): boolean {
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
        targetTypeRefListsMatch(left.typeArguments ?? [], right.typeArguments ?? []);
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListsMatch(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefsMatch(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefListsMatch(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefsMatch(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListsMatch(left.args, right.args) &&
        targetTypeRefsMatch(left.result, right.result) &&
        stringListsMatch(left.abi ?? [], right.abi ?? []);
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefsMatch(left.owner, right.owner);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        left.payloadId === right.payloadId;
  }
}

function targetTypeRefListsMatch(left: readonly TargetTypeRef[], right: readonly TargetTypeRef[]): boolean {
  return left.length === right.length &&
    left.every((item, index) => targetTypeRefsMatch(item, right[index]!));
}

function stringListsMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}
