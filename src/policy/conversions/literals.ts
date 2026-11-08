import { compareSourceNumericLiteralMagnitude, type SourceLiteralUnit, type SourceMemberKey, type SourceNumericLiteralToken } from "@tsonic/target-api/source";
import type { CsharpExactLiteralPrimitive, CsharpExactLiteralRecipe, CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import { createCsharpNumericLiteralToken } from "../../target-model/syntax/numeric-literals.js";
import { csharpBigIntFitsSourcePrimitive, csharpNumericLiteralInteger } from "./literal-range.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { isCsharpIntegralTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";

const notApplicable: CsharpExactLiteralSelection = Object.freeze({ kind: "not-applicable" });
const sourceRepresentation: CsharpExactLiteralSelection = Object.freeze({ kind: "source-representation" });
const float32OverflowThreshold = (1n << 128n) - (1n << 103n);
const float64OverflowThreshold = (1n << 1024n) - (1n << 970n);
const decimalOverflowThresholdTwice = (((1n << 96n) - 1n) << 1n) + 1n;

export function csharpScalarLiteralIsRepresentableAs(value: SourceLiteralUnit, target: TargetTypeRef): boolean {
  if (value.kind === "absence") return csharpCarrierAdmitsSourceAbsence(target);
  const type = getCsharpNullableElementTargetType(target) ?? target;
  if (isCsharpStringTargetType(type)) return value.kind === "string";
  if (type.kind === "target-named" && type.id === "System.Numerics.BigInteger") return value.kind === "bigint";
  if (type.kind !== "source-primitive") return false;
  if (type.name === "bool") return value.kind === "boolean";
  if (type.name === "char") return value.kind === "string" && value.value.length === 1;
  if (value.kind !== "number" && value.kind !== "bigint") return false;
  if (isCsharpIntegralTargetType(type)) {
    const integer = csharpNumericLiteralInteger(value);
    return integer !== undefined && csharpBigIntFitsSourcePrimitive(integer, type.name);
  }
  if (value.kind === "bigint") return false;
  const numeric = value.value;
  if (numeric.kind === "checked-float64") {
    return type.name === "float64";
  }
  const token = numeric.kind === "authored" ? numeric.token : integerToken(numeric.value);
  return floatingLiteralFits(token, type.name);
}

export function selectCsharpExactLiteralConversion(literal: SourceLiteralUnit | undefined,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): CsharpExactLiteralSelection {
  return selectExactScalarLiteral(literal, source, target, "value");
}

function selectExactScalarLiteral(literal: SourceLiteralUnit | undefined, source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined, role: "value" | "property-key"): CsharpExactLiteralSelection {
  if (literal === undefined || target === undefined) return notApplicable;
  const physical = getCsharpNullableElementTargetType(target) ?? target;
  const input = source === undefined ? undefined : getCsharpNullableElementTargetType(source) ?? source;
  const negativeZero = literal.kind === "number" && (literal.value.kind === "authored"
    ? literal.value.token.negative && literal.value.token.coefficient === 0n
    : literal.value.kind === "checked-float64" && Object.is(literal.value.value, -0));
  const floatingSource = input?.kind === "source-primitive" &&
    (input.name === "float16" || input.name === "float32" || input.name === "float64" || input.name === "decimal");
  if (negativeZero && role === "value" && !floatingSource && (input === undefined || !isCsharpIntegralTargetType(input))) {
    return notApplicable;
  }
  if (isCsharpStringTargetType(physical)) return literal.kind === "string"
    ? role === "property-key" ? resolved({ kind: "string", value: literal.value }) : sourceRepresentation : notApplicable;
  if (physical.kind !== "source-primitive") return sourceRepresentation;
  if (physical.name === "char") return literal.kind !== "string" ? notApplicable : literal.value.length === 1
    ? resolved({ kind: "char", value: literal.value }) : rejected("C# char literals require exactly one UTF-16 code unit from original Source literal evidence.");
  if (isCsharpIntegralTargetType(physical)) {
    const integer = csharpNumericLiteralInteger(literal);
    return integer === undefined ? notApplicable : csharpBigIntFitsSourcePrimitive(integer, physical.name)
      ? role === "value" && literal.kind === "number" && literal.value.kind !== "authored" ? sourceRepresentation
        : resolved({ kind: "integer", target: physical, width: physical.name, value: integer })
      : rejected(`Source bigint literal is outside the exact '${physical.name}' range.`);
  }
  if (physical.name === "bool") return literal.kind === "boolean" ? sourceRepresentation : notApplicable;
  if (literal.kind !== "number") return notApplicable;
  const numeric = literal.value;
  if (role === "value" && numeric.kind === "integer") return csharpScalarLiteralIsRepresentableAs(literal, physical)
    ? sourceRepresentation : rejected(`Source numeric literal is outside the '${physical.name}' range.`);
  if (numeric.kind === "checked-float64") return physical.name === "float64"
    ? sourceRepresentation : notApplicable;
  const text = numeric.kind === "authored" ? numeric.token.decimalText : (numeric.value < 0n ? -numeric.value : numeric.value).toString();
  const negative = numeric.kind === "authored" ? numeric.token.negative : numeric.value < 0 || Object.is(numeric.value, -0);
  const zero = numeric.kind === "authored" ? numeric.token.coefficient === 0n : numeric.value === 0n;
  const integralZero = input !== undefined && isCsharpIntegralTargetType(input) && zero;
  if (physical.name === "float16") return resolvedFloat16Literal(physical,
    numeric.kind === "authored" ? numeric.token : integerToken(numeric.value), negative && !integralZero, input);
  if (!csharpScalarLiteralIsRepresentableAs(literal, physical)) return rejected(`Source numeric literal is outside the '${physical.name}' range.`);
  if (physical.name === "float64" && zero && negative && !integralZero) {
    return resolved({ kind: "signed-zero", target: physical, precision: "float64" });
  }
  if (physical.name === "float64" && role === "value") return sourceRepresentation;
  if (physical.name !== "float32" && physical.name !== "float64" && physical.name !== "decimal") return notApplicable;
  return resolved({ kind: "float", target: physical, precision: physical.name,
    token: createCsharpNumericLiteralToken(text), negative: negative && !integralZero });
}

export function selectCsharpExactPropertyKeyConversion(key: SourceMemberKey,
  target: TargetTypeRef | undefined): CsharpExactLiteralSelection {
  if (key.kind === "unique-symbol" || target === undefined) return notApplicable;
  const physical = getCsharpNullableElementTargetType(target) ?? target;
  if (key.kind === "string") return isCsharpStringTargetType(physical)
    ? resolved({ kind: "string", value: key.value }) : physical.kind === "source-primitive" && physical.name === "char"
      ? selectExactScalarLiteral(key, undefined, physical, "property-key")
      : rejected("A native numeric dictionary key requires an original Source numeric constant, not a string-to-number conversion.");
  if (physical.kind !== "source-primitive" || physical.name === "bool") return rejected(
    "A native numeric dictionary key requires an exact selected Native numeric carrier.");
  return selectExactScalarLiteral(key, undefined, physical, "property-key");
}

function integerToken(value: bigint): SourceNumericLiteralToken {
  const magnitude = value < 0n ? -value : value;
  return { coefficient: magnitude, exponent: 0n, negative: value < 0n, decimalText: magnitude.toString() };
}

function floatingLiteralFits(token: SourceNumericLiteralToken, target: CsharpExactLiteralPrimitive["name"]): boolean {
  switch (target) {
    case "float16": return compareSourceNumericLiteralMagnitude(token, 65520n) < 0;
    case "float32": return compareSourceNumericLiteralMagnitude(token, float32OverflowThreshold) < 0;
    case "float64": return compareSourceNumericLiteralMagnitude(token, float64OverflowThreshold) < 0;
    case "decimal": return compareSourceNumericLiteralMagnitude({ coefficient: token.coefficient * 2n, exponent: token.exponent }, decimalOverflowThresholdTwice) < 0;
    default: return false;
  }
}

function resolvedFloat16Literal(target: CsharpExactLiteralPrimitive, token: SourceNumericLiteralToken,
  negative: boolean, source: TargetTypeRef | undefined): CsharpExactLiteralSelection {
  const floatingInput = source?.kind === "source-primitive" && (source.name === "float64" || source.name === "float32");
  const magnitude = floatingInput ? source.name === "float32" ? Math.fround(Number(token.decimalText))
    : Number(token.decimalText) : undefined;
  if (magnitude === undefined ? !floatingLiteralFits(token, "float16") : !Number.isFinite(magnitude) || magnitude >= 65520) {
    return rejected("Source numeric literal is outside the 'float16' range.");
  }
  let lower = 0;
  let upper = 0x7bff;
  const scaled = { coefficient: token.coefficient << 24n, exponent: token.exponent };
  const compare = (units: bigint, shift: 24 | 25): number => magnitude === undefined
    ? compareSourceNumericLiteralMagnitude(shift === 24 ? scaled
      : { coefficient: scaled.coefficient * 2n, exponent: scaled.exponent }, units)
    : magnitude * 2 ** shift < Number(units) ? -1 : magnitude * 2 ** shift > Number(units) ? 1 : 0;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (compare(float16SubnormalUnits(middle), 24) >= 0) lower = middle;
    else upper = middle - 1;
  }
  let bits = lower;
  if (lower < 0x7bff) {
    const comparison = compare(float16SubnormalUnits(lower) + float16SubnormalUnits(lower + 1), 25);
    if (comparison > 0 || comparison === 0 && lower % 2 !== 0) bits += 1;
  }
  const text = magnitude === undefined ? (Number(float16SubnormalUnits(bits)) * 2 ** -24).toString() : magnitude.toString();
  return resolved({ kind: "float", target, precision: "float16", bits: bits | (negative ? 0x8000 : 0),
    token: createCsharpNumericLiteralToken(text), negative });
}

function float16SubnormalUnits(bits: number): bigint {
  const exponent = Math.floor(bits / 1024);
  const significand = BigInt(bits % 1024);
  return exponent === 0 ? significand : (1024n + significand) << BigInt(exponent - 1);
}

function resolved(recipe: CsharpExactLiteralRecipe): CsharpExactLiteralSelection {
  return Object.freeze({ kind: "resolved", recipe: Object.freeze(recipe) });
}

function rejected(reason: string): CsharpExactLiteralSelection {
  return Object.freeze({ kind: "rejected", reason });
}
