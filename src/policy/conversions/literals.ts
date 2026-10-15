import type { CsharpSourceLiteralValue } from "../../target-model/records/source-literals.js";
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
  value: CsharpSourceLiteralValue | undefined,
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
