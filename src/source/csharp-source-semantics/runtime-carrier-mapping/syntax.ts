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
  return type !== undefined && context.compiler?.typeShape.isAny(type) === true;
}

export function getTypeSyntaxCarrierFromFinalizedTypeFacts(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  for (const subject of [request.sourceTypeReference, request.sourceSymbol, request.type]) {
    const node = asNodeSubject(subject);
    if (node !== undefined && isTypeSyntaxNode(ast, node)) {
      const carrier = host.getTargetTypeRefForSubject(node, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      });
      if (carrier !== undefined) {
        return carrier;
      }
    }
  }
  return undefined;
}

export function isCallableTypeWithoutCarrierEvidence(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): boolean {
  const compiler = context.compiler;
  const type = asType(request.type);
  return compiler !== undefined &&
    type !== undefined &&
    compiler.typeShape.getCallSignatures(type).length > 0;
}
