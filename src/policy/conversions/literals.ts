import { compareSourceNumericLiteralMagnitude, type SourceLiteralValue, type SourceNumericLiteralToken,
  type SourcePropertyNameSelection } from "@tsonic/target-api/source";
import type { CsharpExactLiteralPrimitive, CsharpExactLiteralRecipe, CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import {
  csharpBigIntFitsSourcePrimitive,
  csharpNumericLiteralFitsSourcePrimitive,
  createCsharpNumericLiteralToken,
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
    case "float32":
    case "decimal": {
      return value?.numeric?.kind === "authored" && authoredFloatingLiteralFits(value.numeric.token, target.name);
    }
    case "float16": {
      return value?.numeric?.kind === "authored"
        ? authoredFloatingLiteralFits(value.numeric.token, target.name)
        : value?.number !== undefined && Number.isFinite(value.number) && Math.abs(value.number) < 65520;
    }
    case "float64": {
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
  if ((literal?.form === "binary" || literal?.form === "parenthesized" && literal.integer === undefined) &&
    literal.integerConstant !== undefined && csharpBigIntFitsSourcePrimitive(literal.integerConstant, targetType.name)) {
    return sourceRepresentation;
  }
  if (targetType.name === "float32" || targetType.name === "decimal") {
    const numeric = literal?.numeric;
    if (numeric?.kind !== "authored") return notApplicable;
    if (!authoredFloatingLiteralFits(numeric.token, targetType.name)) {
      return rejected(`Source numeric literal is outside the '${targetType.name}' range.`);
    }
    return resolved({ kind: "float", target: targetType, precision: targetType.name,
      token: createCsharpNumericLiteralToken(numeric.token.decimalText), negative: numeric.token.negative });
  }
  if (targetType.name === "float16" && literal?.numeric?.kind === "authored") {
    const token = literal.numeric.token;
    if (!authoredFloatingLiteralFits(token, targetType.name)) {
      return rejected(`Source numeric literal is outside the '${targetType.name}' range.`);
    }
    return resolvedFloat16Literal(targetType, csharpFloat16LiteralBits(token, token.negative));
  }
  if (Object.is(literal?.number, -0)) {
    if (targetType.name === "float64") {
      return resolved({ kind: "signed-zero", target: targetType, precision: targetType.name });
    }
    if (targetType.name === "float16") return resolvedFloat16Literal(targetType, 0x8000);
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
    case "float16": {
      if (literal?.form !== "numeric" && literal?.form !== "prefix-unary") {
        return notApplicable;
      }
      const value = literal.number;
      if (value === undefined || !Number.isFinite(value)) {
        return rejected("C# numeric literal conversion requires an exact finite source value.");
      }
      if (Math.abs(value) >= 65520) {
        return rejected(`Source numeric literal is outside the '${targetType.name}' range.`);
      }
      return resolvedFloat16Literal(targetType, csharpFloat16LiteralBits(Math.abs(value), value < 0));
    }
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
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

const float32OverflowThreshold = (1n << 128n) - (1n << 103n);
const float64OverflowThreshold = (1n << 1024n) - (1n << 970n);
const decimalOverflowThresholdTwice = (((1n << 96n) - 1n) << 1n) + 1n;

export function selectCsharpExactPropertyKeyConversion(
  key: SourcePropertyNameSelection,
  target: TargetTypeRef | undefined,
): CsharpExactLiteralSelection {
  if (key.kind === "rejected") return rejected(key.reason);
  if (key.kind !== "resolved" || target === undefined) return rejected(
    "Record dictionary object literal keys require an exact string or numeric native constant.");
  const physical = getCsharpNullableElementTargetType(target) ?? target;
  if (isCsharpStringTargetType(physical)) return resolved({ kind: "string", value: key.name });
  if (physical.kind !== "source-primitive") return rejected(
    "Record dictionary object literal keys require a renderable native scalar carrier.");
  const constant = key.constant;
  if (physical.name === "char") {
    const text = constant.kind === "string" ? constant.value
      : constant.kind === "enum-member" && typeof constant.entry.value === "string" ? constant.entry.value : undefined;
    return text !== undefined && text.length === 1 ? resolved({ kind: "char", value: text })
      : rejected("C# char property keys require exactly one UTF-16 code unit from a checked string constant.");
  }
  const token = constant.kind === "numeric" ? constant.token : undefined;
  const enumInteger = constant.kind === "enum-member" && typeof constant.entry.value === "bigint" ? constant.entry.value : undefined;
  if (token === undefined && enumInteger === undefined) return rejected(
    "A native numeric dictionary key requires a checked numeric constant, not a string-to-number conversion.");
  const magnitude = enumInteger === undefined ? undefined : enumInteger < 0n ? -enumInteger : enumInteger;
  const compare = (limit: bigint) => token === undefined
    ? magnitude! < limit ? -1 : magnitude! > limit ? 1 : 0
    : compareSourceNumericLiteralMagnitude(token, limit);
  const negative = token === undefined ? enumInteger! < 0n : token.negative;
  if (physical.name === "float16" || physical.name === "float32" || physical.name === "float64" || physical.name === "decimal") {
    const fits = physical.name === "decimal" ? token === undefined
      ? magnitude! * 2n < decimalOverflowThresholdTwice
      : compareSourceNumericLiteralMagnitude({ coefficient: token.coefficient * 2n, exponent: token.exponent }, decimalOverflowThresholdTwice) < 0
      : compare(physical.name === "float16" ? 65520n : physical.name === "float32" ? float32OverflowThreshold : float64OverflowThreshold) < 0;
    if (!fits) return rejected(`Source numeric property key is outside the '${physical.name}' range.`);
    if (physical.name === "float16") return resolvedFloat16Literal(physical,
      csharpFloat16LiteralBits(token ?? { coefficient: magnitude!, exponent: 0n }, negative));
    return resolved({ kind: "float", target: physical, precision: physical.name,
      token: createCsharpNumericLiteralToken(token === undefined ? magnitude!.toString() : token.decimalText), negative });
  }
  if (physical.name === "bool") return rejected("A native dictionary key cannot convert a numeric constant into a boolean.");
  let integer = enumInteger;
  if (integer === undefined && token !== undefined) {
    if (token.coefficient !== 0n && (token.exponent < 0n || compare(1n << 128n) >= 0)) return rejected(
      `Source numeric property key has no exact '${physical.name}' integer representation.`);
    integer = token.coefficient === 0n ? 0n : token.coefficient * 10n ** token.exponent * (negative ? -1n : 1n);
  }
  if (integer === undefined || !csharpBigIntFitsSourcePrimitive(integer, physical.name)) return rejected(
    `Source numeric property key is outside the exact '${physical.name}' range.`);
  return resolved({ kind: "integer", target: physical, width: physical.name, value: integer });
}

function authoredFloatingLiteralFits(token: SourceNumericLiteralToken, target: "float16" | "float32" | "decimal"): boolean {
  switch (target) {
    case "float16":
      return compareSourceNumericLiteralMagnitude(token, 65520n) < 0;
    case "float32":
      return compareSourceNumericLiteralMagnitude(token, float32OverflowThreshold) < 0;
    case "decimal":
      return compareSourceNumericLiteralMagnitude({ coefficient: token.coefficient * 2n, exponent: token.exponent },
        decimalOverflowThresholdTwice) < 0;
  }
}

function resolvedFloat16Literal(target: CsharpExactLiteralPrimitive, bits: number): CsharpExactLiteralSelection {
  const magnitude = Number(float16SubnormalUnits(bits & 0x7fff)) * 2 ** -24;
  return resolved({ kind: "float", target, precision: "float16", bits,
    token: createCsharpNumericLiteralToken(magnitude.toString()), negative: (bits & 0x8000) !== 0 });
}

function csharpFloat16LiteralBits(
  magnitude: Pick<SourceNumericLiteralToken, "coefficient" | "exponent"> | number,
  negative: boolean,
): number {
  const compare = (units: bigint, shift: 24 | 25): -1 | 0 | 1 => {
    if (typeof magnitude !== "number") return compareSourceNumericLiteralMagnitude(
      { coefficient: magnitude.coefficient << BigInt(shift), exponent: magnitude.exponent }, units);
    const scaled = magnitude * 2 ** shift;
    const exact = Number(units);
    return scaled < exact ? -1 : scaled > exact ? 1 : 0;
  };
  let lower = 0;
  let upper = 0x7bff;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (compare(float16SubnormalUnits(middle), 24) >= 0) lower = middle;
    else upper = middle - 1;
  }
  let selected = lower;
  if (lower < 0x7bff) {
    const midpoint = float16SubnormalUnits(lower) + float16SubnormalUnits(lower + 1);
    const relation = compare(midpoint, 25);
    if (relation > 0 || relation === 0 && lower % 2 !== 0) selected += 1;
  }
  return selected | (negative ? 0x8000 : 0);
}

function float16SubnormalUnits(bits: number): bigint {
  const exponent = Math.floor(bits / 1024);
  const significand = BigInt(bits % 1024);
  return exponent === 0 ? significand : (1024n + significand) << BigInt(exponent - 1);
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
