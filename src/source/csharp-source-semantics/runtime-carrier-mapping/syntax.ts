import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  isTypeSyntaxNode,
} from "../ast-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  asType,
} from "../target-ref-utils.js";

export function isAnyRuntimeCarrierType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): boolean {
  return type !== undefined && context.compiler?.types.isAny(type) === true;
}

export function getTypeSyntaxCarrierFromFinalizedTypeFacts(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(request.sourceTypeReference);
  return ast !== undefined && node !== undefined && isTypeSyntaxNode(ast, node)
    ? host.getTargetTypeRefForSubject(node, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false })
    : undefined;
}

export function isCallableTypeWithoutCarrierEvidence(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): boolean {
  const compiler = context.compiler;
  const type = asType(request.type);
  return compiler !== undefined &&
    type !== undefined &&
    compiler.types.getCallSignatures(type).length > 0;
}
