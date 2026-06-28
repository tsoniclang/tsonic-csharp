import type {
  TargetTypeParameter,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../csharp-source-semantics/target-types.js";
import {
  targetConstraintArrayEquals,
} from "./constraints.js";
import {
  targetTypeRefEquals,
} from "./target-type-ref.js";

export function targetMemberEquals(left: CsharpTargetMember | undefined, right: CsharpTargetMember | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return left.id === right.id
    && left.sourceName === right.sourceName
    && left.targetName === right.targetName
    && left.kind === right.kind
    && left.static === right.static
    && left.receiverPassing === right.receiverPassing
    && left.overloadGroup === right.overloadGroup
    && targetTypeRefEquals(left.declaringType, right.declaringType)
    && targetTypeRefEquals(left.returnType, right.returnType)
    && targetParameterArrayEquals(left.parameters, right.parameters)
    && targetTypeParameterArrayEquals(left.typeParameters, right.typeParameters);
}

function targetParameterArrayEquals(left: readonly CsharpTargetParameter[] | undefined, right: readonly CsharpTargetParameter[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined
      && parameter.name === other.name
      && parameter.passingMode === other.passingMode
      && parameter.optional === other.optional
      && parameter.paramsArray === other.paramsArray
      && targetOwnedParameterMetadataEquals(parameter, other)
      && targetTypeRefEquals(parameter.type, other.type);
  });
}

function targetOwnedParameterMetadataEquals(left: CsharpTargetParameter, right: CsharpTargetParameter): boolean {
  return simpleMetadataEquals(
    (left as { readonly defaultValue?: unknown }).defaultValue,
    (right as { readonly defaultValue?: unknown }).defaultValue,
  );
}

function targetTypeParameterArrayEquals(left: readonly TargetTypeParameter[] | undefined, right: readonly TargetTypeParameter[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined
      && parameter.name === other.name
      && parameter.variance === other.variance
      && targetConstraintArrayEquals(parameter.constraints, other.constraints);
  });
}

function simpleMetadataEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return key === rightKey && simpleMetadataEquals(left[key], right[rightKey]);
    });
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
