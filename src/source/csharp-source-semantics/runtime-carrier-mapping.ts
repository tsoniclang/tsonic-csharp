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
  csharpSourcePrimitiveTargetType,
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
  getRuntimeUnionCarrier,
} from "./runtime-carrier-mapping/unions.js";
import {
  getTupleRuntimeCarrier,
} from "./runtime-carrier-mapping/tuples.js";

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
  const tupleCarrier = getTupleRuntimeCarrier(request, context, host);
  if (tupleCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: tupleCarrier,
    }, [{ message: "C# tuple runtime carrier mapped from checked TSTS tuple element facts." }]);
  }
  const requestType = asType(request.type);
  if (isAnyRuntimeCarrierType(requestType, context)) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: csharpAnyRuntimeCarrier(),
    }, [{ message: "C# opaque any runtime carrier recorded from explicit TypeScript any boundary; dynamic behavior requires separate finalized target facts." }]);
  }
  const primitiveSubject = [
    request.sourceTypeReference,
    request.sourceSymbol,
    request.type,
  ].find((subject) =>
    subject !== undefined && context.factResolver.resolve(subject, sourcePrimitiveFactKey) !== undefined
  );
  if (primitiveSubject !== undefined) {
    const primitive = context.factResolver.resolve(primitiveSubject, sourcePrimitiveFactKey);
    if (primitive === undefined) {
      throw new Error("C# runtime carrier primitive evidence disappeared during exact fact resolution.");
    }
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: csharpSourcePrimitiveTargetType(primitive.kind),
    }, [{ message: "C# primitive runtime carrier mapped from finalized TSTS source-primitive evidence." }]);
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
  const runtimeUnionCarrier = getRuntimeUnionCarrier(request, context, host);
  if (runtimeUnionCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: runtimeUnionCarrier,
    }, [{ message: "C# runtime union carrier mapped from TSTS union constituents and finalized constituent/nullish carrier facts." }]);
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
