import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpSourcePrimitiveTargetType, getCsharpJsArrayElementTargetType } from "../../../../target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import type { CsharpSourceProfileCallPolicy } from "../../../model/source-profiles.js";
import { resolveCsharpSourceProfileGenericResult } from "../source-profile-result.js";
import { jsRuntimeTargetType, staticMethod, targetParameter } from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const arrayStaticsType = jsRuntimeTargetType("JSArrayStatics");

export function arrayConstructionMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const resultType = arrayConstructorResultType(context);
  const element = getCsharpJsArrayElementTargetType(resultType);
  if (resultType === undefined || element === undefined) {
    return undefined;
  }
  if (arrayHasLengthArgument(context)) {
    return Object.freeze({
      id: "Tsonic.CSharp.Js.JSArray..ctor(length)",
      sourceName: "constructor",
      targetName: "JSArray",
      kind: "constructor",
      declaringType: resultType,
      parameters: [targetParameter("length", intType)],
      returnType: resultType,
    });
  }
  return Object.freeze({
    id: "Tsonic.CSharp.Js.JSArrayStatics.of:construction",
    sourceName: "constructor",
    targetName: "of",
    kind: "constructor",
    declaringType: resultType,
    parameters: [targetParameter("items", { kind: "array", element }, { paramsArray: true })],
    returnType: resultType,
    csharpInvocation: {
      kind: "static-factory-construction",
      factoryType: arrayStaticsType,
    },
    typeParameters: [{ identity: "Tsonic.CSharp.Js.JSArrayStatics.of:construction::0", name: "T", csharpAllowsRefLike: false }],
  } satisfies CsharpTargetMember);
}

export function arrayCallMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const resultType = arrayConstructorResultType(context);
  const element = getCsharpJsArrayElementTargetType(resultType);
  if (resultType === undefined || element === undefined) {
    return undefined;
  }
  const numericLength = arrayHasLengthArgument(context);
  return staticMethod(
    numericLength
      ? "Tsonic.CSharp.Js.JSArrayStatics.withLength"
      : "Tsonic.CSharp.Js.JSArrayStatics.of:call",
    "constructor",
    numericLength ? "withLength" : "of",
    arrayStaticsType,
    numericLength
      ? [targetParameter("length", intType)]
      : [targetParameter("items", { kind: "array", element }, { paramsArray: true })],
    resultType,
    { typeParameters: [{ name: "T", csharpAllowsRefLike: false }] },
  );
}

export function arrayConstructorElementTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const result = arrayConstructorResultType(context);
  const element = getCsharpJsArrayElementTargetType(result);
  return element === undefined ? undefined : [element];
}

function arrayConstructorResultType(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): TargetTypeRef | undefined {
  return resolveCsharpSourceProfileGenericResult(context, 1, (arguments_) => csharpJsArrayTargetType(arguments_[0]!));
}

export function arrayConstructionTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  return arrayHasLengthArgument(context) ? [] : arrayConstructorElementTypeArguments(context);
}

function arrayHasLengthArgument(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): boolean {
  const parameter = context.inputs.parameters[0];
  return context.source.arguments.length === 1 &&
    context.source.parameters.length === 1 &&
    context.source.parameters[0]?.kind !== "rest" &&
    parameter?.kind === "source-primitive" && parameter.name === "int32";
}
