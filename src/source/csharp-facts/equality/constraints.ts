import type {
  TargetConstraint,
} from "@tsonic/tsts";
import type {
  CsharpTypeParameterConstraint,
} from "../../csharp-facts.js";
import {
  targetTypeRefArrayEquals,
  targetTypeRefEquals,
} from "./target-type-ref.js";

export function csharpTypeParameterConstraintArrayEquals(
  left: readonly CsharpTypeParameterConstraint[] | undefined,
  right: readonly CsharpTypeParameterConstraint[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((constraint, index) => csharpTypeParameterConstraintEquals(constraint, right[index]));
}

function csharpTypeParameterConstraintEquals(
  left: CsharpTypeParameterConstraint | undefined,
  right: CsharpTypeParameterConstraint | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "csharp-type") {
    return right.kind === "csharp-type" && targetTypeRefEquals(left.type, right.type);
  }
  if (left.kind === "csharp-keyword") {
    return right.kind === "csharp-keyword" && left.keyword === right.keyword;
  }
  if (left.kind === "csharp-constructor") {
    return right.kind === "csharp-constructor";
  }
  return right.kind !== "csharp-type" &&
    right.kind !== "csharp-keyword" &&
    right.kind !== "csharp-constructor" &&
    targetConstraintEquals(left, right);
}

export function targetConstraintArrayEquals(left: readonly TargetConstraint[] | undefined, right: readonly TargetConstraint[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((constraint, index) => targetConstraintEquals(constraint, right[index]));
}

function targetConstraintEquals(left: TargetConstraint | undefined, right: TargetConstraint | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "implements":
      return right.kind === "implements"
        && left.contract === right.contract
        && targetTypeRefArrayEquals(left.typeArguments, right.typeArguments);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific"
        && left.target === right.target
        && left.name === right.name
        && targetSpecificValueEquals(left.value, right.value);
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "copy":
    case "clone":
    case "default":
    case "sized":
      return true;
  }
}

function targetSpecificValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return key === rightKey && targetSpecificValueEquals(left[key], right[rightKey]);
    });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
