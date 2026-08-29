import {
  csharpTargetNamedType,
} from "../types/factories.js";
import type {
  CsharpTargetBinaryExecutionDriver,
} from "../types/model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../types/render-shapes.js";

export const csharpJsEventLoopBinaryExecutionDriver:
  CsharpTargetBinaryExecutionDriver =
  Object.freeze({
    id: "tsonic.csharp.js.event-loop-v1",
    declaringType: Object.freeze(csharpTargetNamedType(
      "Tsonic.CSharp.Js.JsEventLoop",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JsEventLoop"),
    )),
    runMethodName: "Run",
    runWithEntrypointMethodName: "Run",
  });
