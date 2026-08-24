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
  const sourceSignature = getCsharpDelegateSignature(sourceCallableType);
  if (
    sourceSignature === undefined ||
    !targetTypeRefEquals(sourceSignature.returnType, resultType)
  ) {
    return undefined;
  }
  const callbackType = csharpTargetNamedType(
    "Tsonic.CSharp.Js.ReplacementCallback",
    undefined,
    csharpQualifiedTypeRenderShape(
      "Tsonic.CSharp.Js",
      "ReplacementCallback",
    ),
    {
      delegateSignature: {
        parameters: [replacementArgumentsType],
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
