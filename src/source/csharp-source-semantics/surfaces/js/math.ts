import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  range,
  targetMethod,
  targetParameter,
} from "./source-library.js";

export function getMathTargetMembers(sourceName: string): readonly TargetMember[] {
  const targetName = mathTargetNames.get(sourceName);
  if (targetName === undefined) {
    return [];
  }
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const parameterCount = sourceName === "atan2" || sourceName === "max" || sourceName === "min" || sourceName === "pow" ? 2 : 1;
  return [targetMethod(`System.Math.${targetName}`, sourceName, targetName, range(parameterCount).map((index) => targetParameter(`value${index}`, doubleType)), doubleType, {
    declaringType: csharpTargetNamedType("System.Math", undefined, csharpQualifiedTypeRenderShape("System", "Math")),
    static: true,
  })];
}

const mathTargetNames = new Map<string, string>([
  ["abs", "Abs"],
  ["acos", "Acos"],
  ["asin", "Asin"],
  ["atan", "Atan"],
  ["atan2", "Atan2"],
  ["cos", "Cos"],
  ["cosh", "Cosh"],
  ["exp", "Exp"],
  ["log", "Log"],
  ["log10", "Log10"],
  ["log2", "Log2"],
  ["max", "Max"],
  ["min", "Min"],
  ["pow", "Pow"],
  ["sin", "Sin"],
  ["sinh", "Sinh"],
  ["sqrt", "Sqrt"],
  ["tan", "Tan"],
  ["tanh", "Tanh"],
  ["trunc", "Truncate"],
]);
