import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";
import {
  getCallableExpressionTargetTypeRef,
} from "../callable-target-types.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  asType,
} from "../target-ref-utils.js";

export function getCallableRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(request.sourceTypeReference);
  const type = asType(request.type);
  if (compiler === undefined || node === undefined || type === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  return sourceFile === undefined
    ? undefined
    : getCallableExpressionTargetTypeRef(node, type, sourceFile, context, host);
}
