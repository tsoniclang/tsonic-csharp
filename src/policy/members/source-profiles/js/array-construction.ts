import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpJsArrayTargetType, csharpSourcePrimitiveTargetType, getCsharpJsArrayElementTargetType } from "../../../types/index.js";
import type { CsharpSourceProfileCallPolicy } from "../source-profile-policy.js";
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
    return Object.freeze({
      id: "Tsonic.CSharp.Js.JSArray..ctor(length)",
      sourceName: "constructor",
      targetName: "JSArray",
      kind: "constructor",
      declaringType: resultType,
      parameters: [targetParameter("length", doubleType)],
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
    typeParameters: [{ name: "T" }],
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
  const selected = context.source.sourceSelectedMethodTypeArguments ?? [];
  if (selected.length !== 0) {
    if (selected.length !== 1) {
      return undefined;
    }
    const element = context.host.types.resolveSelectedType(
      selected[0]!.explicitTypeNode,
      selected[0]!.selectedType,
      context.sourceFile,
    );
    return element === undefined ? undefined : csharpJsArrayTargetType(element);
  }
  return context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
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
