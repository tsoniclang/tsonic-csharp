import {
  acceptObservation,
  argumentPassingFactKey,
  defaultValueFactKey,
  flowStateFactKey,
  rejectObservation,
  structFactKey,
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
  StructFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  unsupportedCsharpSourceFlowMarkerDiagnostic,
} from "../source-flow-diagnostics.js";
import {
  getTargetArgumentConversionSlots,
} from "../target-member-arguments/argument-conversions.js";
import {
  getApplicableSourceCallEvidence,
} from "../selected-source-evidence.js";
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
    if (!isRequiredString((fieldFact as { readonly name?: unknown }).name)) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_FIELD_MARKER_NAME_NOT_PROVEN",
        9100161,
        "C# field marker call requires finalized TSTS field name evidence before erasure.",
        sourceMarkerFactEvidence("field", "field.name", fieldFact),
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
    return acceptErasedMarkerCall(
      request,
      erasedFieldFactMember(fieldFact),
      extensionId,
      "C# field marker call was checked by finalized TSTS field facts and marked for fact-driven erasure.",
    );
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
      attributeFact,
      extensionId,
    );
    if (missingFactDiagnostic !== undefined) {
      return rejectObservation(missingFactDiagnostic);
    }
    return acceptErasedMarkerCall(
      request,
      member,
      extensionId,
      "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure.",
    );
  }
  return undefined;
}

function acceptErasedMarkerCall(
  request: CheckedCallMappingRequest,
  member: TargetMember,
  extensionId: string,
  message: string,
): ExtensionObservation<CheckedCallMappingResult> {
  const argumentConversions = getTargetArgumentConversionSlots(member.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: getApplicableSourceCallEvidence(request)?.argumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ERASED_SOURCE_MARKER_ARGUMENT_BINDINGS_NOT_PROVEN",
      9100186,
      "C# source-semantics marker erasure requires exact TSTS argument-slot evidence.",
      undefined,
      request.call,
    ));
  }
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: { member },
    argumentConversions,
  }, [{ message }]);
}

function missingRequiredSourceMarkerFactDiagnostic(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  declaration: ProviderVirtualDeclarationFact,
  attributeFact: ReturnType<typeof getCheckedAttributeBuilderFact>,
  extensionId: string,
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
      return validateCsharpAttributeMarkerFact(attributeFact, extensionId);
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
    case "struct":
      return validateStructMarkerFact(request, context, declaration.exportName, extensionId);
    default:
      return undefined;
  }
}

export function validateCsharpAttributeMarkerFact(
  attributeFact: ReturnType<typeof getCheckedAttributeBuilderFact>,
  extensionId: string,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  if (attributeFact === undefined) {
    return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_ATTRIBUTE_MARKER_FACT_NOT_PROVEN", "attribute", "attribute");
  }
  if ((attributeFact as { readonly target?: unknown }).target === undefined) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ATTRIBUTE_MARKER_TARGET_NOT_PROVEN",
      9100162,
      "C# attribute marker call requires finalized TSTS attribute target evidence before erasure.",
      sourceMarkerFactEvidence("attribute", "attribute.target", attributeFact),
    );
  }
  if (!isRequiredString((attributeFact as { readonly attributeName?: unknown }).attributeName)) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ATTRIBUTE_MARKER_NAME_NOT_PROVEN",
      9100163,
      "C# attribute marker call requires finalized TSTS attribute name evidence before erasure.",
      sourceMarkerFactEvidence("attribute", "attribute.attributeName", attributeFact),
    );
  }
  return undefined;
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

function validateStructMarkerFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  markerName: "struct",
  extensionId: string,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  const structFact = getFinalizedStructFact(request, context);
  if (structFact === undefined) {
    return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_STRUCT_MARKER_FACT_NOT_PROVEN", markerName, "struct");
  }
  if ((structFact as { readonly valueType?: unknown }).valueType !== true) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_STRUCT_MARKER_VALUE_TYPE_NOT_PROVEN",
      9100164,
      "C# struct marker call requires finalized TSTS value-type struct evidence before erasure.",
      sourceMarkerFactEvidence(markerName, "struct.valueType", structFact),
    );
  }
  const fields = (structFact as { readonly fields?: unknown }).fields;
  if (!Array.isArray(fields)) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_STRUCT_MARKER_FIELDS_NOT_PROVEN",
      9100165,
      "C# struct marker call requires finalized TSTS struct field evidence before erasure.",
      sourceMarkerFactEvidence(markerName, "struct.fields", structFact),
    );
  }
  for (const field of fields) {
    if (!isRequiredString((field as { readonly name?: unknown }).name)) {
      return csharpProviderDiagnostic(
        extensionId,
        "CSHARP_STRUCT_MARKER_FIELD_NAME_NOT_PROVEN",
        9100166,
        "C# struct marker call requires finalized TSTS field name evidence for every struct field before erasure.",
        sourceMarkerFactEvidence(markerName, "struct.fields[].name", structFact),
      );
    }
    if ((field as { readonly type?: unknown }).type === undefined) {
      return csharpProviderDiagnostic(
        extensionId,
        "CSHARP_STRUCT_MARKER_FIELD_TYPE_NOT_PROVEN",
        9100167,
        "C# struct marker call requires finalized TSTS field type evidence for every struct field before erasure.",
        sourceMarkerFactEvidence(markerName, "struct.fields[].type", structFact),
      );
    }
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

function getFinalizedStructFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): StructFact | undefined {
  return context.factResolver.resolve(request.call, structFactKey) ??
    context.facts.get(request.call, structFactKey);
}

function getFinalizedDefaultValueFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): { readonly type?: unknown } | undefined {
  return context.factResolver.resolve(request.call, defaultValueFactKey) ??
    context.facts.get(request.call, defaultValueFactKey);
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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
