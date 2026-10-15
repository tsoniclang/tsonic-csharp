import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpSourcePrimitiveTargetType, getCsharpJsArrayElementTargetType } from "../../../../target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../types/resolution/surface-types.js";
import type { CsharpSourceProfileCallPolicy } from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { resolveCsharpSourceProfileGenericResult } from "../source-profile-result.js";
import { jsRuntimeTargetType, staticMethod, targetParameter } from "./common.js";

const doubleType = csharpSourcePrimitiveTargetType("float64");
const arrayStaticsType = jsRuntimeTargetType("JSArrayStatics");

export function arrayConstructionMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const resultType = arrayConstructorResultType(context);
  const element = getCsharpJsArrayElementTargetType(resultType);
  if (resultType === undefined || element === undefined) {
    return undefined;
  }
  const sourceArgument = context.source.sourceArguments[0];
  const numericLength = context.source.sourceArguments.length === 1 &&
    sourceArgument !== undefined &&
    context.host.semantics(context.sourceFile).types.isNumberLike(
      sourceArgument.type,
    );
  if (numericLength) {
    const carrier = resolveCsharpSelectedSourceValue(context, sourceArgument);
    return Object.freeze({
      id: "Tsonic.CSharp.Js.JSArray..ctor(length)",
      sourceName: "constructor",
      targetName: "JSArray",
      kind: "constructor",
      declaringType: resultType,
      parameters: [targetParameter("length", carrier?.kind === "source-primitive" && carrier.name === "int32" ? carrier : doubleType)],
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
    typeParameters: [{ identity: "Tsonic.CSharp.Js.JSArrayStatics.of:construction::0", name: "T" }],
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
  const sourceArgument = context.source.sourceArguments[0];
  const numericLength = context.source.sourceArguments.length === 1 &&
    sourceArgument !== undefined &&
    context.host.semantics(context.sourceFile).types.isNumberLike(
      sourceArgument.type,
    );
  return staticMethod(
    numericLength
      ? "Tsonic.CSharp.Js.JSArrayStatics.withLength"
      : "Tsonic.CSharp.Js.JSArrayStatics.of:call",
    "constructor",
    numericLength ? "withLength" : "of",
    arrayStaticsType,
    numericLength
      ? [targetParameter("length", doubleType)]
      : [targetParameter("items", { kind: "array", element }, { paramsArray: true })],
    resultType,
    { typeParameters: [{ name: "T" }] },
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
  const sourceArgument = context.source.sourceArguments[0];
  const numericLength = context.source.sourceArguments.length === 1 &&
    sourceArgument !== undefined &&
    context.host.semantics(context.sourceFile).types.isNumberLike(
      sourceArgument.type,
    );
  return numericLength ? [] : arrayConstructorElementTypeArguments(context);
}
