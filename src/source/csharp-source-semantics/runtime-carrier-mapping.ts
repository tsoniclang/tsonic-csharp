import {
  acceptObservation,
  deferObservation,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  asNodeSubject,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  asType,
} from "./target-ref-utils.js";
import {
  getCallableExpressionTargetTypeRef,
} from "./callable-target-types.js";
import {
  recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects,
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects,
} from "./runtime-carrier-object-shapes.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";

export function mapRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const callableCarrier = getCallableRuntimeCarrier(request, context, host);
  if (callableCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: callableCarrier,
    }, [{ message: "C# callable runtime carrier mapped from checked TSTS signature and source parameter facts." }]);
  }
  const requestType = asType(request.type);
  const primitive = (request.sourceTypeReference === undefined ? undefined : context.factResolver.resolve(request.sourceTypeReference, sourcePrimitiveFactKey)) ??
    (request.sourceTypeSymbol === undefined ? undefined : context.factResolver.resolve(request.sourceTypeSymbol, sourcePrimitiveFactKey));
  const syntaxCarrier = request.sourceTypeReference === undefined
    ? undefined
    : host.getTargetTypeRefForSubject(request.sourceTypeReference, context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false });
  const typeSyntaxCarrier = syntaxCarrier ??
    getTypeSyntaxCarrierFromFinalizedTypeFacts(request, context, host);
  if (typeSyntaxCarrier !== undefined) {
    recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, typeSyntaxCarrier, host);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: typeSyntaxCarrier,
    }, [{ message: "C# runtime carrier mapped from source syntax/provider facts." }]);
  }
  if (primitive === undefined) {
    if (isCallableTypeWithoutCarrierEvidence(request, context)) {
      return deferObservation;
    }
    const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
      host.getRecordedCsharpObjectShapeFactForSubject(request.type, context);
    if (objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
      return acceptObservation<RuntimeCarrierFactResult>({
        carrier: objectShape.targetType,
      }, [{ message: "C# runtime carrier mapped from finalized structural object-shape facts." }]);
    }
    const carrier = host.getTargetTypeRefForType(requestType, context, { allowRuntimeCarrier: false });
    return carrier === undefined
      ? deferObservation
      : acceptObservation<RuntimeCarrierFactResult>({
          carrier,
        }, [{ message: "C# runtime carrier mapped from checked TSTS type shape." }]);
  }
  return acceptObservation<RuntimeCarrierFactResult>({
    carrier: csharpSourcePrimitiveTargetType(primitive.kind),
  }, [{ message: "C# runtime carrier mapped from source primitive fact." }]);
}

function getTypeSyntaxCarrierFromFinalizedTypeFacts(
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

function isCallableTypeWithoutCarrierEvidence(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): boolean {
  const compiler = context.compiler;
  const type = asType(request.type);
  return compiler !== undefined &&
    type !== undefined &&
    compiler.types.getCallSignatures(type).length > 0;
}

function getCallableRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
) {
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
