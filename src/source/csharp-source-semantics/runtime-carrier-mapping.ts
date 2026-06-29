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
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects,
  recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects,
} from "./runtime-carrier-object-shapes.js";
import {
  csharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  asType,
} from "./target-ref-utils.js";
import {
  subjectIsSourceCoreStructDeclarationPayload,
} from "./object-shape-recorded-facts.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";
import {
  getCallableRuntimeCarrier,
} from "./runtime-carrier-mapping/callable.js";
import {
  getExistingRuntimeCarrier,
} from "./runtime-carrier-mapping/existing.js";
import {
  getTypeSyntaxCarrierFromFinalizedTypeFacts,
  isAnyRuntimeCarrierType,
  isCallableTypeWithoutCarrierEvidence,
} from "./runtime-carrier-mapping/syntax.js";
import {
  getCommonNonNullishUnionRuntimeCarrier,
  getNonNullishRuntimeUnionCarrier,
} from "./runtime-carrier-mapping/unions.js";

export function mapRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  if (subjectIsSourceCoreStructDeclarationPayload(request.type, context)) {
    return deferObservation;
  }
  const existingCarrier = getExistingRuntimeCarrier(request, context);
  if (existingCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: existingCarrier,
    }, [{ message: "C# runtime carrier reused from finalized provider facts for this semantic subject." }]);
  }
  const callableCarrier = getCallableRuntimeCarrier(request, context, host);
  if (callableCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: callableCarrier,
    }, [{ message: "C# callable runtime carrier mapped from checked TSTS signature and source parameter facts." }]);
  }
  const requestType = asType(request.type);
  if (isAnyRuntimeCarrierType(requestType, context)) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: csharpAnyRuntimeCarrier(),
    }, [{ message: "C# opaque any runtime carrier recorded from explicit TypeScript any boundary; dynamic behavior requires separate finalized target facts." }]);
  }
  const primitive = context.factResolver.resolve(request.type, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return deferObservation;
  }
  const syntaxCarrier = requestType === undefined
    ? host.getTargetTypeRefForSubject(request.type, context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false })
    : undefined;
  const typeSyntaxCarrier = syntaxCarrier ??
    getTypeSyntaxCarrierFromFinalizedTypeFacts(request, context, host);
  if (typeSyntaxCarrier !== undefined) {
    recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, typeSyntaxCarrier, host);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: typeSyntaxCarrier,
    }, [{ message: "C# runtime carrier mapped from source syntax/provider facts." }]);
  }
  const commonUnionCarrier = getCommonNonNullishUnionRuntimeCarrier(request, context, host);
  if (commonUnionCarrier !== undefined) {
    if (commonUnionCarrier.objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, commonUnionCarrier.objectShape);
    }
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: commonUnionCarrier.carrier,
    }, [{ message: "C# non-nullish union runtime carrier mapped from identical finalized constituent carriers." }]);
  }
  const runtimeUnionCarrier = getNonNullishRuntimeUnionCarrier(request, context, host);
  if (runtimeUnionCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: runtimeUnionCarrier,
    }, [{ message: "C# runtime union carrier mapped from TSTS union constituents and finalized constituent carrier facts." }]);
  }
  if (isCallableTypeWithoutCarrierEvidence(request, context)) {
    return deferObservation;
  }
  const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(request.type, context);
  if (objectShape !== undefined) {
    recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: objectShape.targetType,
    }, [{ message: "C# runtime carrier mapped from finalized structural object-shape facts." }]);
  }
  return deferObservation;
}
