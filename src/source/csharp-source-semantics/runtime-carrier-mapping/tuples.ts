import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  asType,
} from "../target-ref-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";

export function getTupleRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const type = asType(request.type);
  const types = context.compiler?.typeShape;
  if (type === undefined || types === undefined || !types.isTypeReference(type) || !types.isTuple(type)) {
    return undefined;
  }
  const elements = types.getTupleElementTypes(type)
    .map((element) => getTupleElementRuntimeCarrier(element, context, host));
  return elements.some((element) => element === undefined)
    ? undefined
    : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
}

function getTupleElementRuntimeCarrier(
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  return context.factResolver.resolve(type, runtimeCarrierFactKey)?.carrier ??
    context.facts.get(type, runtimeCarrierFactKey)?.carrier ??
    host.getRecordedCsharpObjectShapeFactForSubject(type, context)?.targetType ??
    host.getTargetTypeRefForType(type, context, {}) ??
    host.getCsharpObjectShapeFactForSubject(type, context)?.targetType;
}
