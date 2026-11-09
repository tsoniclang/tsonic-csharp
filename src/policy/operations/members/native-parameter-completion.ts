import type { CsharpTargetAttributeValue, CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { csharpBigIntFitsSourcePrimitive } from "../../conversions/literal-range.js";

type NativeDefault = Extract<CsharpTargetAttributeValue, { readonly kind: "null" | "string" | "source-primitive" | "enum" }>;
export type CsharpNativeParameterCompletion =
  | { readonly kind: "params"; readonly type: TargetTypeRef }
  | { readonly kind: "native-default"; readonly type: TargetTypeRef; readonly value: NativeDefault }
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpNativeParameterCompletion(parameter: CsharpTargetParameter): CsharpNativeParameterCompletion {
  const rejected = (reason: string): CsharpNativeParameterCompletion => Object.freeze({ kind: "rejected", reason });
  if (parameter.passingMode !== "by-value") return rejected("A Native-only completion cannot omit a by-reference parameter.");
  if (parameter.paramsArray === true) return parameter.type.kind === "array" && parameter.type.rank === undefined
    ? Object.freeze({ kind: "params", type: parameter.type })
    : rejected("A Native params completion requires the actual vector-array parameter type.");
  if (parameter.optional !== true || parameter.unsupportedDefaultValue !== undefined) {
    return rejected("An unmapped Native parameter requires its original optional/default or params contract.");
  }
  const value = parameter.defaultValue;
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    return rejected("A Native-only optional parameter requires its actual representable default constant.");
  }
  let selected: NativeDefault;
  if (value.kind === "null" && Object.keys(value).length === 1) selected = Object.freeze({ kind: "null" });
  else if (value.kind === "string" && "value" in value && typeof value.value === "string" && Object.keys(value).length === 2) {
    selected = Object.freeze({ kind: "string", value: value.value });
  } else if (value.kind === "enum" && "value" in value && typeof value.value === "string" &&
    /^-?(?:0|[1-9][0-9]*)$/u.test(value.value) &&
    BigInt(value.value) >= -(1n << 63n) && BigInt(value.value) <= (1n << 64n) - 1n &&
    Object.keys(value).every(key => key === "kind" || key === "value" || key === "fieldName") &&
    (!("fieldName" in value) || typeof value.fieldName === "string")) {
    selected = Object.freeze({ kind: "enum", type: parameter.type, value: value.value,
      ...("fieldName" in value && typeof value.fieldName === "string" ? { fieldName: value.fieldName } : {}) });
  } else if (value.kind === "source-primitive" && "name" in value && typeof value.name === "string" &&
    "value" in value && (typeof value.value === "string" || typeof value.value === "boolean") &&
    Object.keys(value).length === 3 && nativePrimitiveDefaultFits(value.name, value.value)) {
    selected = Object.freeze({ kind: "source-primitive", name: value.name, value: value.value });
  } else return rejected("The original Native default constant has no exact supported physical representation.");
  return Object.freeze({ kind: "native-default", type: parameter.type, value: selected });
}

function nativePrimitiveDefaultFits(name: string, value: string | boolean): boolean {
  if (name === "bool") return typeof value === "boolean";
  if (typeof value !== "string") return false;
  if (name === "char") return value.length === 1;
  for (const integer of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64"] as const) {
    if (name === integer) return /^-?(?:0|[1-9][0-9]*)$/u.test(value) &&
      csharpBigIntFitsSourcePrimitive(BigInt(value), integer);
  }
  if (name !== "float32" && name !== "float64" && name !== "decimal") return false;
  if (name !== "decimal" && (value === "NaN" || value === "Infinity" || value === "-Infinity")) return true;
  const token = /^-?((?:0|[1-9][0-9]*))(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(value);
  if (token === null) return false;
  if (name === "float64") return Number.isFinite(Number(value));
  if (name === "float32") return Number.isFinite(Math.fround(Number(value)));
  let coefficient = BigInt(token[1]! + (token[2] ?? ""));
  let scale = BigInt(token[2]?.length ?? 0) - BigInt(token[3] ?? "0");
  if (coefficient === 0n) return true;
  while (scale > 0n && coefficient % 10n === 0n) { coefficient /= 10n; scale -= 1n; }
  if (scale < -28n || scale > 28n) return false;
  return (scale < 0n ? coefficient * 10n ** -scale : coefficient) <= (1n << 96n) - 1n;
}
