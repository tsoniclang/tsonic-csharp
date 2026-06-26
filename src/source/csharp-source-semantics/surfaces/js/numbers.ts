import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "./source-library.js";

const numberOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.Number", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Number"));
const stringType = csharpStringTargetType();
const numberType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");

export function isCsharpNumberTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" &&
    (
      type.name === "float64" ||
      type.name === "float32" ||
      type.name === "int32" ||
      type.name === "uint32" ||
      type.name === "int16" ||
      type.name === "uint16" ||
      type.name === "int8" ||
      type.name === "uint8"
    );
}

export function getNumberTargetMembers(sourceName: string): readonly TargetMember[] {
  switch (sourceName) {
    case "parseInt":
      return [
        numberStaticMethod("parseInt", [targetParameter("str", stringType)], numberType),
        numberStaticMethod("parseInt", [targetParameter("str", stringType), targetParameter("radix", intType)], numberType, "radix"),
      ];
    case "parseFloat":
      return [numberStaticMethod(sourceName, [targetParameter("str", stringType)], numberType)];
    case "isNaN":
    case "isFinite":
    case "isInteger":
    case "isSafeInteger":
      return [numberStaticMethod(sourceName, [targetParameter("value", numberType)], boolType)];
    case "toString":
      return [numberInstanceMethod(sourceName, stringType)];
    case "valueOf":
      return [numberInstanceMethod(sourceName, numberType)];
    default:
      return [];
  }
}

export function getNumberPropertyTargetMember(sourceName: string): TargetMember | undefined {
  return numberPropertyTargetMembers.get(sourceName);
}

export function numberStaticCallRequiresNoReceiver(sourceName: string): boolean {
  return numberStaticMethodNames.has(sourceName);
}

function numberStaticMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  idSuffix?: string,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Number.${sourceName}${idSuffix === undefined ? "" : `:${idSuffix}`}`, sourceName, sourceName, parameters, returnType, {
    declaringType: numberOpsType,
    static: true,
  });
}

function numberInstanceMethod(sourceName: string, returnType: TargetTypeRef): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Number.${sourceName}`, sourceName, sourceName, [
    targetParameter("value", numberType),
  ], returnType, {
    declaringType: numberOpsType,
    static: true,
    receiverPassing: "first-argument",
  });
}

function numberProperty(sourceName: string): TargetMember {
  return targetProperty(`Tsonic.CSharp.Js.Number.${sourceName}`, sourceName, sourceName, numberType, {
    declaringType: numberOpsType,
    static: true,
  });
}

const numberStaticMethodNames = new Set([
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "isInteger",
  "isSafeInteger",
]);

const numberPropertyTargetMembers = new Map<string, TargetMember>([
  "MAX_VALUE",
  "MIN_VALUE",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "POSITIVE_INFINITY",
  "NEGATIVE_INFINITY",
  "NaN",
  "EPSILON",
].map((name) => [name, numberProperty(name)] as const));
