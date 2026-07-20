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
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";

export function recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  carrier: TargetTypeRef,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const objectShape = host.getCsharpObjectShapeFactForSubject(request.type, context);
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
  const sourceDeclaredStruct = isSourceDeclaredStructObjectShapeFact(objectShape);
  if (!sourceDeclaredStruct) {
    context.facts.set(request.type, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to runtime carrier type." }]);
    context.facts.set(objectShape.targetType, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to finalized target carrier type." }]);
  }
  if (sourceDeclaredStruct) {
    return;
  }
}

function isSourceDeclaredStructObjectShapeFact(objectShape: CsharpObjectShapeFact): boolean {
  return objectShape.targetType.kind === "target-named" &&
    (objectShape.targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}
