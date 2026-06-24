import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "./source-library.js";

const mathTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Math", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Math"));

export function getMathTargetMembers(sourceName: string): readonly TargetMember[] {
  const targetMember = mathTargetMembers.get(sourceName);
  return targetMember === undefined ? [] : [targetMember];
}

export function getMathPropertyTargetMember(sourceName: string): TargetMember | undefined {
  return mathPropertyTargetMembers.get(sourceName);
}

function mathMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType = csharpSourcePrimitiveTargetType("float64"),
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Math.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: mathTargetType,
    static: true,
  });
}

function mathProperty(sourceName: string): TargetMember {
  return targetProperty(`Tsonic.CSharp.Js.Math.${sourceName}`, sourceName, sourceName, csharpSourcePrimitiveTargetType("float64"), {
    declaringType: mathTargetType,
    static: true,
  });
}

const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const longType = csharpSourcePrimitiveTargetType("int64");

const unaryDoubleMethodNames = [
  "abs",
  "acos",
  "acosh",
  "asin",
  "asinh",
  "atan",
  "atanh",
  "cbrt",
  "cos",
  "cosh",
  "exp",
  "expm1",
  "f16round",
  "fround",
  "log",
  "log10",
  "log1p",
  "log2",
  "sin",
  "sinh",
  "sqrt",
  "tan",
  "tanh",
] as const;

const mathTargetMembers = new Map<string, TargetMember>([
  ...unaryDoubleMethodNames.map((name) => [name, mathMethod(name, [targetParameter("value", doubleType)])] as const),
  ["atan2", mathMethod("atan2", [targetParameter("y", doubleType), targetParameter("x", doubleType)])],
  ["pow", mathMethod("pow", [targetParameter("value0", doubleType), targetParameter("value1", doubleType)])],
  ["hypot", mathMethod("hypot", [targetParameter("values", doubleType, { paramsArray: true })])],
  ["max", mathMethod("max", [targetParameter("values", doubleType, { paramsArray: true })])],
  ["min", mathMethod("min", [targetParameter("values", doubleType, { paramsArray: true })])],
  ["random", mathMethod("random", [])],
  ["ceil", mathMethod("ceil", [targetParameter("value", doubleType)], longType)],
  ["floor", mathMethod("floor", [targetParameter("value", doubleType)], longType)],
  ["round", mathMethod("round", [targetParameter("value", doubleType)], longType)],
  ["trunc", mathMethod("trunc", [targetParameter("value", doubleType)], longType)],
  ["sign", mathMethod("sign", [targetParameter("value", doubleType)], intType)],
  ["imul", mathMethod("imul", [targetParameter("left", intType), targetParameter("right", intType)], intType)],
  ["clz32", mathMethod("clz32", [targetParameter("value", intType)], intType)],
]);

const mathPropertyTargetMembers = new Map<string, TargetMember>([
  "E",
  "PI",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "SQRT1_2",
  "SQRT2",
].map((name) => [name, mathProperty(name)] as const));
