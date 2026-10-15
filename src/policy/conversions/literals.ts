import type { SourceLiteralValue } from "@tsonic/target-api/source";
import type { CsharpExactLiteralRecipe, CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import {
  csharpBigIntFitsSourcePrimitive,
  csharpNumericLiteralFitsSourcePrimitive,
} from "../../target-model/syntax/numeric-literals.js";
import type {
  TargetTypeRef,
} from "../types/index.js";
import {
  getCsharpArrayLiteralElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpStringTargetType,
} from "../../target-model/types/index.js";

export function csharpLiteralIsRepresentableAs(
  value: SourceLiteralValue | undefined,
  target: TargetTypeRef,
): boolean {
  const nullableElement = getCsharpNullableElementTargetType(target);
  if (nullableElement !== undefined) {
    return csharpLiteralIsRepresentableAs(value, nullableElement);
  }
  if (value?.form === "array") {
    const elementType = target.kind === "array"
      ? target.element
      : getCsharpArrayLiteralElementTargetType(target);
    return elementType !== undefined &&
      value.elements.every((element) =>
        element !== undefined &&
        csharpLiteralIsRepresentableAs(element, elementType));
  }
  if (isCsharpStringTargetType(target)) {
    return value?.form === "string" || value?.form === "template";
  }
  if (target.kind !== "source-primitive") {
    return false;
  }
  if ((value?.form === "binary" || value?.form === "parenthesized") &&
    value.integerConstant !== undefined && csharpBigIntFitsSourcePrimitive(value.integerConstant, target.name)) return true;
  switch (target.name) {
    case "bool":
      return value?.form === "true" || value?.form === "false";
    case "char":
      return (value?.form === "string" || value?.form === "template") &&
        value.text.length === 1;
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      return csharpNumericLiteralFitsSourcePrimitive(value, target.name);
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      return value?.number !== undefined && Number.isFinite(value.number);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      return value?.integer !== undefined &&
        csharpBigIntFitsSourcePrimitive(value.integer, target.name);
    }
  }
}

const notApplicable: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });
const sourceRepresentation: CsharpExactLiteralSelection = Object.freeze({ kind: "source-representation" });

export function selectCsharpExactLiteralConversion(
  literal: SourceLiteralValue | undefined,
  target: TargetTypeRef | undefined,
): CsharpExactLiteralSelection {
  if (target === undefined) {
    return notApplicable;
  }
  const targetType = getCsharpNullableElementTargetType(target) ?? target;
  if (targetType.kind !== "source-primitive") {
    return classifiedLiteralRepresentation(literal);
  }
  if ((literal?.form === "binary" || literal?.form === "parenthesized") &&
    literal.integerConstant !== undefined && csharpBigIntFitsSourcePrimitive(literal.integerConstant, targetType.name)) {
    return sourceRepresentation;
  }
  if (Object.is(literal?.number, -0)) {
    if (targetType.name === "float64" || targetType.name === "float32" || targetType.name === "float16") {
      return resolved({ kind: "signed-zero", target: targetType, precision: targetType.name });
    }
    if (targetType.name !== "decimal" && csharpNumericLiteralFitsSourcePrimitive(literal, targetType.name)) {
      return resolved({ kind: "zero" });
    }
  }
  switch (targetType.name) {
    case "char": {
      if ((literal?.form !== "string" && literal?.form !== "template") || literal.text === undefined) {
        return notApplicable;
      }
      return literal.text.length === 1
        ? resolved({ kind: "char", value: literal.text })
        : rejected("C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing.");
    }
    case "float16":
    case "float32":
    case "decimal": {
      if (literal?.form !== "numeric" && literal?.form !== "prefix-unary") {
        return notApplicable;
      }
      const value = literal.number;
      if (value === undefined || !Number.isFinite(value)) {
        return rejected("C# numeric literal conversion requires an exact finite source value.");
      }
      return resolved({ kind: "float", target: targetType, precision: targetType.name, value });
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128":
    case "native-int":
    case "native-uint": {
      const value = literal?.integer;
      if (value === undefined) {
        return notApplicable;
      }
      if (!csharpBigIntFitsSourcePrimitive(value, targetType.name)) {
        return rejected(`Source bigint literal is outside the exact '${targetType.name}' range.`);
      }
      return resolved({ kind: "integer", target: targetType, width: targetType.name, value });
    }
    default:
      return classifiedLiteralRepresentation(literal);
  }
}

function classifiedLiteralRepresentation(literal: SourceLiteralValue | undefined): CsharpExactLiteralSelection {
  return literal !== undefined && literal.form !== "parenthesized" && literal.form !== "binary"
    ? sourceRepresentation
    : notApplicable;
}

function resolved(recipe: CsharpExactLiteralRecipe): CsharpExactLiteralSelection {
  return Object.freeze({ kind: "resolved", recipe: Object.freeze(recipe) });
}

function rejected(reason: string): CsharpExactLiteralSelection {
  return Object.freeze({ kind: "rejected", reason });
}
