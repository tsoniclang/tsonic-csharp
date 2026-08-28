import {
  csharpTargetNamedType,
} from "../../target-model/types/factories.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../../target-model/types/render-shapes.js";
import type {
  CsharpProviderBinaryEpilogue,
} from "../model/provider-policy-contribution.js";

export const csharpJsEventLoopBinaryEpilogue: CsharpProviderBinaryEpilogue =
  Object.freeze({
    id: "tsonic.csharp.js.event-loop-v1",
    declaringType: Object.freeze(csharpTargetNamedType(
      "Tsonic.CSharp.Js.JsEventLoop",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JsEventLoop"),
    )),
    methodName: "Run",
  });
