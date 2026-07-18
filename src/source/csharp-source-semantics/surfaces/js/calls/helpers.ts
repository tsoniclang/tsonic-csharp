import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../arrays.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpJsCheckedTypeQuery,
} from "../source-library.js";
import {
  getCsharpCheckedCallCalleeReceiver,
  getCsharpCheckedCallRequestContext,
} from "../../../checked-call-request-context.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../../dictionaries.js";
import {
  targetTypeRefEquals,
} from "../../../target-ref-utils.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../dictionaries.js";

export function getNonSemanticTargetType(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(subject, context, {
    ...csharpJsCheckedTypeQuery,
    allowSemanticTypeQuery: false,
  }));
}

export function isNumericSourcePrimitive(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" &&
    (
      type.name === "float64" ||
      type.name === "float32" ||
      type.name === "int32" ||
      type.name === "uint32" ||
      type.name === "int16" ||
      type.name === "uint16" ||
      type.name === "int8" ||
      type.name === "uint8"
    );
}

export function isNewExpression(
  request: Pick<CheckedCallMappingRequest, "callKind">,
): boolean {
  return request.callKind === "construct";
}

export function getSourceLibraryCallReceiverElementType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .map(getCsharpArrayLikeElementType)
    .find((element): element is TargetTypeRef => element !== undefined);
}

export function getSourceLibraryCallReceiverTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetTypeRef[] {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const candidates = [
    requestContext.calleeReceiver,
    requestContext.calleeReceiverType,
    requestContext.calleeReceiverTypeSymbol,
  ];
  const result: TargetTypeRef[] = [];
  for (const candidate of candidates) {
    const targetType = host.unwrapNullableTargetType(getSourceLibraryReceiverTargetTypeForSubject(candidate, context, host));
    if (targetType !== undefined && !result.includes(targetType)) {
      result.push(targetType);
    }
  }
  return result;
}

export function getSourceLibraryCallReceiverClosedTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): readonly TargetTypeRef[] {
  const receiver = getCsharpCheckedCallCalleeReceiver(request);
  if (receiver === undefined) {
    return [];
  }
  const candidates = [
    context.facts.get(receiver, selectedTargetSignatureFactKey)?.member.returnType,
    context.facts.get(receiver, runtimeCarrierFactKey)?.carrier,
    context.factResolver.resolve(receiver, selectedTargetSignatureFactKey)?.member.returnType,
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier,
    getResolvedSourcePrimitiveTargetType(receiver, context),
  ];
  const result: TargetTypeRef[] = [];
  for (const candidate of candidates) {
    if (candidate !== undefined && !result.some((existing) => targetTypeRefEquals(existing, candidate))) {
      result.push(candidate);
    }
  }
  return result;
}

export function getSourceLibraryCallArgumentTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly (TargetTypeRef | undefined)[] {
  return request.sourceArguments.map((argument) => {
    const subjects = [
      argument.expression,
      argument.type,
      argument.selectedDeclaration,
      argument.selectedSymbol,
      argument.declaration,
      argument.symbol,
    ];
    for (const subject of subjects) {
      const targetType = getSourceLibraryReceiverTargetTypeForSubject(subject, context, host);
      if (targetType !== undefined) {
        return host.unwrapNullableTargetType(targetType);
      }
    }
    return undefined;
  });
}

export function getSourceLibraryCallResultTargetType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    context.facts.get(request.call, selectedTargetSignatureFactKey)?.member.returnType ??
      context.facts.get(request.call, runtimeCarrierFactKey)?.carrier ??
      context.factResolver.resolve(request.call, selectedTargetSignatureFactKey)?.member.returnType ??
      context.factResolver.resolve(request.call, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(request.sourceResult.type, context, {
        ...csharpJsCheckedTypeQuery,
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }) ??
      host.getTargetTypeRefForSubject(request.sourceResult.expression, context, {
        ...csharpJsCheckedTypeQuery,
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}

export function isStringKeyedRecordDictionaryTargetType(
  type: TargetTypeRef,
  host: CsharpJsSurfaceHost,
): type is CsharpRecordDictionaryTargetTypeRef {
  const typeArguments = type.kind === "target-named" ? type.typeArguments ?? [] : [];
  const keyType = typeArguments[0];
  return isCsharpRecordDictionaryTargetType(type) &&
    host.isCsharpStringType(keyType);
}

function getSourceLibraryReceiverTargetTypeForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  if (subject === undefined) {
    return undefined;
  }
  const localFactTarget = getTargetTypeRefFromLocalFacts(subject, context);
  if (localFactTarget !== undefined) {
    return localFactTarget;
  }
  const resolvedFactTarget = getTargetTypeRefFromResolvedFacts(subject, context);
  if (resolvedFactTarget !== undefined) {
    return resolvedFactTarget;
  }
  return host.getTargetTypeRefForSubject(subject, context, {
      ...csharpJsCheckedTypeQuery,
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: false,
    });
}

function getTargetTypeRefFromLocalFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  return context.facts.get(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    context.facts.get(subject, runtimeCarrierFactKey)?.carrier;
}

function getTargetTypeRefFromResolvedFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  return context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    (primitive === undefined ? undefined : csharpSourcePrimitiveTargetType(primitive.kind));
}

function getResolvedSourcePrimitiveTargetType(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  return primitive === undefined ? undefined : csharpSourcePrimitiveTargetType(primitive.kind);
}
