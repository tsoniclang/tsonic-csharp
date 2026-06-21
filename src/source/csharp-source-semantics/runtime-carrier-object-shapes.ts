import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asType,
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carriers.js";

export function recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  carrier: TargetTypeRef,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
    host.getRecordedCsharpObjectShapeFactForSubject(request.type, context);
  if (objectShape === undefined || !targetTypeRefEquals(objectShape.targetType, carrier)) {
    return;
  }
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
}

export function recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  objectShape: CsharpObjectShapeFact,
): void {
  context.facts.set(request.type, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to runtime carrier type." }]);
  if (request.sourceTypeReference !== undefined) {
    context.facts.set(request.sourceTypeReference, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type reference." }]);
  }
  if (request.sourceTypeSymbol !== undefined) {
    context.facts.set(request.sourceTypeSymbol, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type symbol." }]);
  }
  const typeSymbol = asType(request.type)?.symbol;
  if (typeSymbol !== undefined) {
    context.facts.set(typeSymbol, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type symbol." }]);
  }
}
