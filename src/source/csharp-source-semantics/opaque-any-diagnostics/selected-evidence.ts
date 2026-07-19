import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  CheckedOperatorMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  getRecordedCsharpRuntimeCarrierFact,
} from "../../csharp-facts.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";
import type {
  OpaqueAnyOperation,
} from "./diagnostic.js";

export function getCheckedCallOpaqueAnyOperation(
  request: CheckedCallMappingRequest,
  context: Pick<ExtensionObservationContext, "facts">,
): OpaqueAnyOperation | undefined {
  if (
    request.sourceSelection.kind !== "untyped" &&
    !hasOpaqueAnyCarrier([request.sourceCallee.expression, request.sourceCallee.type], context)
  ) {
    return undefined;
  }
  return request.callKind === "construct"
    ? { kind: "construct", description: "C# construct emission" }
    : { kind: "call", description: "C# call emission" };
}

export function getCheckedPropertyOpaqueAnyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: Pick<ExtensionObservationContext, "facts">,
): OpaqueAnyOperation | undefined {
  return hasOpaqueAnyCarrier([request.sourceReceiver.expression, request.sourceReceiver.type], context)
    ? { kind: "property", description: "C# property access emission" }
    : undefined;
}

export function getCheckedElementOpaqueAnyOperation(
  request: CheckedElementAccessMappingRequest,
  context: Pick<ExtensionObservationContext, "facts">,
): OpaqueAnyOperation | undefined {
  return hasOpaqueAnyCarrier([request.sourceReceiver.expression, request.sourceReceiver.type], context)
    ? { kind: "element", description: "C# element access emission" }
    : undefined;
}

export function getCheckedOperatorOpaqueAnyOperation(
  request: CheckedOperatorMappingRequest,
  context: Pick<ExtensionObservationContext, "facts">,
): OpaqueAnyOperation | undefined {
  if (request.operatorKind === "binary" && request.operator === "=") {
    return undefined;
  }
  const subjects = request.operatorKind === "binary"
    ? [
        request.sourceLeft.expression,
        request.sourceLeft.type,
        request.sourceRight.expression,
        request.sourceRight.type,
      ]
    : [request.sourceOperand.expression, request.sourceOperand.type];
  return hasOpaqueAnyCarrier(subjects, context)
    ? { kind: "operator", description: `C# '${request.operator}' operator emission` }
    : undefined;
}

function hasOpaqueAnyCarrier(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  context: Pick<ExtensionObservationContext, "facts">,
): boolean {
  return subjects.some((subject) => subject !== undefined &&
    isCsharpAnyRuntimeCarrier(getRecordedCsharpRuntimeCarrierFact(context.facts, subject)?.carrier));
}
