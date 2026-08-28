import type {
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  getCsharpDelegateSignature,
  targetTypeRefEquals,
} from "../../../types/index.js";
import {
  jsRuntimeTargetType,
  targetParameter,
} from "./common.js";

const replacementArgumentsType = jsRuntimeTargetType(
  "ReplacementCallbackArguments",
);

export function csharpJsReplacementCallbackParameter(
  name: string,
  sourceCallableType: TargetTypeRef,
  resultType: TargetTypeRef,
): CsharpTargetParameter | undefined {
  return csharpJsArgumentVectorCallbackParameter(
    name,
    sourceCallableType,
    resultType,
    "Tsonic.CSharp.Js.ReplacementCallback",
    "ReplacementCallback",
    replacementArgumentsType,
  );
}

export function csharpJsArgumentVectorCallbackParameter(
  name: string,
  sourceCallableType: TargetTypeRef,
  resultType: TargetTypeRef,
  targetId: string,
  targetName: string,
  argumentVectorType: TargetTypeRef,
): CsharpTargetParameter | undefined {
  const sourceSignature = getCsharpDelegateSignature(sourceCallableType);
  if (
    sourceSignature === undefined ||
    !targetTypeRefEquals(sourceSignature.returnType, resultType)
  ) {
    return undefined;
  }
  const callbackType = csharpTargetNamedType(
    targetId,
    undefined,
    csharpQualifiedTypeRenderShape(
      "Tsonic.CSharp.Js",
      targetName,
    ),
    {
      delegateSignature: {
        parameters: [argumentVectorType],
        returnType: resultType,
      },
    },
  );
  return targetParameter(name, callbackType, {
    csharpAcceptsCheckedSourceArgument: true,
    csharpSourceArgumentAdapter: Object.freeze({
      kind: "ecmascript-argument-vector-callback",
      sourceCallableType,
    }),
  });
}
