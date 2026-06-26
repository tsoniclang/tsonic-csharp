import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceSingleTargetMemberForSourceName,
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "./target-member-metadata.js";

const mathTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Math", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Math"));

export function mathTargetMembersForSourceName(sourceName: string): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(mathTargetMemberIndex, sourceName);
}

export function mathPropertyTargetMemberForSourceName(sourceName: string): TargetMember | undefined {
  return jsSurfaceSingleTargetMemberForSourceName(mathPropertyTargetMemberIndex, sourceName);
}

function mathMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType = csharpSourcePrimitiveTargetType("float64"),
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Math.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: mathTargetType,
    static: true,
  };
}

function mathPropertyMetadata(sourceName: string): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Math.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    returnType: csharpSourcePrimitiveTargetType("float64"),
    declaringType: mathTargetType,
    static: true,
  };
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

const mathTargetMemberMetadata = [
  ...unaryDoubleMethodNames.map((sourceName) => mathMethodMetadata(sourceName, [targetParameter("value", doubleType)])),
  mathMethodMetadata("atan2", [targetParameter("y", doubleType), targetParameter("x", doubleType)]),
  mathMethodMetadata("pow", [targetParameter("value0", doubleType), targetParameter("value1", doubleType)]),
  mathMethodMetadata("hypot", [targetParameter("values", doubleType, { paramsArray: true })]),
  mathMethodMetadata("max", [targetParameter("values", doubleType, { paramsArray: true })]),
  mathMethodMetadata("min", [targetParameter("values", doubleType, { paramsArray: true })]),
  mathMethodMetadata("random", []),
  mathMethodMetadata("ceil", [targetParameter("value", doubleType)], longType),
  mathMethodMetadata("floor", [targetParameter("value", doubleType)], longType),
  mathMethodMetadata("round", [targetParameter("value", doubleType)], longType),
  mathMethodMetadata("trunc", [targetParameter("value", doubleType)], longType),
  mathMethodMetadata("sign", [targetParameter("value", doubleType)], intType),
  mathMethodMetadata("imul", [targetParameter("left", intType), targetParameter("right", intType)], intType),
  mathMethodMetadata("clz32", [targetParameter("value", intType)], intType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const mathTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(mathTargetMemberMetadata);

const mathPropertyTargetMemberMetadata = [
  "E",
  "PI",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "SQRT1_2",
  "SQRT2",
].map((sourceName) => mathPropertyMetadata(sourceName)) satisfies readonly JsSurfaceTargetMemberMetadata[];
const mathPropertyTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(mathPropertyTargetMemberMetadata);
