import {
  acceptObservation,
  argumentPassingFactKey,
  defaultValueFactKey,
  flowStateFactKey,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  ArgumentPassingFact,
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionEvidence,
  ExtensionObservation,
  ExtensionObservationContext,
  FlowStateFact,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  unsupportedCsharpSourceFlowMarkerDiagnostic,
} from "../source-flow-diagnostics.js";
import {
  erasedAttributeFactMember,
  erasedFieldFactMember,
  erasedSourceSemanticsMember,
  getCheckedAttributeBuilderFact,
  getCheckedFieldFact,
  isErasedFieldSourceSemanticsCall,
  isErasedSourceSemanticsCall,
} from "../erased-source-markers.js";

export function mapCsharpSourceMarkerCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  virtualDeclaration: ProviderVirtualDeclarationFact | undefined,
  attributeFact: ReturnType<typeof getCheckedAttributeBuilderFact>,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (isErasedFieldSourceSemanticsCall(virtualDeclaration)) {
    const fieldFact = getCheckedFieldFact(request, context);
    if (fieldFact === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN",
        9100112,
        "C# field marker call requires a finalized TSTS FieldFact with field type evidence before erasure.",
      ));
    }
    if ((fieldFact as { readonly type?: unknown }).type === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_FIELD_MARKER_TYPE_NOT_PROVEN",
        9100152,
        "C# field marker call requires finalized TSTS field type evidence before erasure.",
        sourceMarkerFactEvidence("field", "field.type", fieldFact),
      ));
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedFieldFactMember(fieldFact) },
    }, [{ message: "C# field marker call was checked by finalized TSTS field facts and marked for fact-driven erasure." }]);
  }
  if (isErasedSourceSemanticsCall(virtualDeclaration)) {
    const member = erasedSourceSemanticsMember(virtualDeclaration) ??
      (attributeFact === undefined ? undefined : erasedAttributeFactMember(attributeFact));
    if (member === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_ERASED_SOURCE_MARKER_IDENTITY_NOT_PROVEN",
        9100111,
        "C# source-semantics marker call was checked by TSTS, but no provider virtual member or signature identity proves the erased marker selection.",
      ));
    }
    const missingFactDiagnostic = missingRequiredSourceMarkerFactDiagnostic(
      request,
      context,
      virtualDeclaration,
      extensionId,
      attributeFact !== undefined,
    );
    if (missingFactDiagnostic !== undefined) {
      return rejectObservation(missingFactDiagnostic);
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  return undefined;
}

function missingRequiredSourceMarkerFactDiagnostic(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  declaration: ProviderVirtualDeclarationFact,
  extensionId: string,
  hasAttributeFact: boolean,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  switch (declaration.exportName) {
    case "out":
    case "ref":
    case "inref":
      return validateArgumentPassingMarkerFact(request, context, declaration.exportName, extensionId);
    case "borrow":
    case "borrowMut":
    case "move":
      {
        const flowState = getFinalizedFlowStateFact(request, context);
        return flowState === undefined
          ? missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN", declaration.exportName, "source-flow")
          : unsupportedCsharpSourceFlowMarkerDiagnostic(extensionId, flowState);
      }
    case "attribute":
      return !hasAttributeFact
        ? missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_ATTRIBUTE_MARKER_FACT_NOT_PROVEN", declaration.exportName, "attribute")
        : undefined;
    case "defaultof":
      {
        const defaultValue = getFinalizedDefaultValueFact(request, context);
        if (defaultValue === undefined) {
          return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_DEFAULT_MARKER_FACT_NOT_PROVEN", declaration.exportName, "default-value");
        }
        return (defaultValue as { readonly type?: unknown }).type === undefined
          ? csharpProviderDiagnostic(
              extensionId,
              "CSHARP_DEFAULT_MARKER_TYPE_NOT_PROVEN",
              9100153,
              "C# defaultof marker call requires finalized TSTS default-value type evidence before erasure.",
              sourceMarkerFactEvidence("defaultof", "defaultValue.type", defaultValue),
            )
          : undefined;
      }
    default:
      return undefined;
  }
}

function validateArgumentPassingMarkerFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  markerName: "out" | "ref" | "inref",
  extensionId: string,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  const passing = getFinalizedArgumentPassingFact(request, context);
  if (passing === undefined) {
    return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN", markerName, "argument-passing");
  }
  const expectedMode = expectedArgumentPassingMode(markerName);
  if (passing.mode !== expectedMode) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ARGUMENT_MARKER_MODE_NOT_PROVEN",
      9100150,
      `C# source marker '${markerName}' requires finalized TSTS argument-passing mode '${expectedMode}', but received '${String(passing.mode)}'.`,
      sourceMarkerFactEvidence(markerName, "argumentPassing.mode", passing),
    );
  }
  if (passing.targetExpression === undefined) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ARGUMENT_MARKER_STORAGE_NOT_PROVEN",
      9100151,
      `C# source marker '${markerName}' requires finalized TSTS storage target evidence before it can be erased.`,
      sourceMarkerFactEvidence(markerName, "argumentPassing.targetExpression", passing),
    );
  }
  return undefined;
}

function expectedArgumentPassingMode(markerName: "out" | "ref" | "inref"): ArgumentPassingFact["mode"] {
  switch (markerName) {
    case "out":
      return "byref-writeonly-must-init";
    case "ref":
      return "byref-readwrite";
    case "inref":
      return "byref-readonly";
  }
}

function getFinalizedArgumentPassingFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ArgumentPassingFact | undefined {
  return context.factResolver.resolve(request.call, argumentPassingFactKey) ??
    context.facts.get(request.call, argumentPassingFactKey);
}

function getFinalizedFlowStateFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): FlowStateFact | undefined {
  return context.factResolver.resolve(request.call, flowStateFactKey) ??
    context.facts.get(request.call, flowStateFactKey);
}

function getFinalizedDefaultValueFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): { readonly type?: unknown } | undefined {
  return context.factResolver.resolve(request.call, defaultValueFactKey) ??
    context.facts.get(request.call, defaultValueFactKey);
}

function sourceMarkerFactEvidence(
  markerName: string,
  requiredField: string,
  fact: unknown,
): readonly ExtensionEvidence[] {
  return [{
    message: "C# source marker fact validation failed closed.",
    details: {
      markerName,
      requiredField,
      fact,
    },
  }];
}

function missingSourceMarkerFactDiagnostic(
  extensionId: string,
  code: string,
  markerName: string,
  factName: string,
): ReturnType<typeof csharpProviderDiagnostic> {
  return csharpProviderDiagnostic(
    extensionId,
    code,
    9100149,
    `C# source marker '${markerName}' requires a finalized TSTS ${factName} fact before the marker call can be erased.`,
  );
}
