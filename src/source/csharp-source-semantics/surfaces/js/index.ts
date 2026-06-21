import {
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedIterationMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetIterationFactKey,
} from "../../../csharp-facts.js";
import type {
  CsharpTargetIterationFact,
} from "../../../csharp-facts.js";
import {
  getArrayLengthOperation,
  getArrayTargetMembers,
  mapCsharpJsArrayElementAccess,
} from "./arrays.js";
import {
  getMathTargetMembers,
} from "./math.js";
import {
  getRegExpTargetMembers,
  mapCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpTargetNamedType,
  getSourceLibraryMember,
  getSourceLibraryMemberFromReceiver,
  targetOperation,
} from "./source-library.js";
import {
  getStringLengthOperation,
  getStringTargetMembers,
  mapCsharpJsStringElementAccess,
} from "./strings.js";

export interface CsharpJsSurfaceMappers {
  readonly mapRuntimeCarrier: (
    request: RuntimeCarrierFactRequest,
    context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  ) => ExtensionObservation<RuntimeCarrierFactResult>;
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedElementAccess: (
    request: CheckedElementAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedIteration: (
    request: CheckedIterationMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpJsSurfaceMappers(host: CsharpJsSurfaceHost): CsharpJsSurfaceMappers {
  return {
    mapRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsRegExpRuntimeCarrier(request, context);
    },
    mapCheckedCall(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpSourceLibraryCheckedCall(request, context, host) ?? deferObservation;
    },
    mapCheckedPropertyAccess(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpDirectSourceLibraryCheckedPropertyAccess(request, context, host) ??
        mapCsharpReceiverSourceLibraryCheckedPropertyAccess(request, context, host) ??
        deferObservation;
    },
    mapCheckedElementAccess(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpSourceLibraryCheckedElementAccess(request, context, host) ?? deferObservation;
    },
    mapCheckedIteration(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsSurfaceCheckedIteration(request, context, host);
    },
  };
}

function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, request.calleePropertyName, context) ??
    getSourceLibraryMemberFromReceiver(request.calleeReceiverType, request.calleePropertyName, context, host) ??
    getSourceLibraryMemberFromReceiver(request.calleeReceiver, request.calleePropertyName, context, host);
  if (sourceMember === undefined) {
    return undefined;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember);
  if (candidates.length === 0) {
    return undefined;
  }
  const member = host.selectTargetMember(candidates, request.arguments, context);
  if (member === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' to a unique target member from finalized argument facts.`));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, request.propertyName, context);
  return mapCsharpSourceLibraryPropertyOperation(sourceMember, host);
}

function mapCsharpReceiverSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMemberFromReceiver(request.receiverType, request.propertyName, context, host) ??
    getSourceLibraryMemberFromReceiver(request.receiver, request.propertyName, context, host);
  return mapCsharpSourceLibraryPropertyOperation(sourceMember, host);
}

function mapCsharpSourceLibraryPropertyOperation(
  sourceMember: SourceLibraryMember | undefined,
  _host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  const operation = getSourceLibraryPropertyOperation(sourceMember);
  if (operation === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation,
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery),
  );
  return mapCsharpJsArrayElementAccess(request, context, receiverType, host) ??
    mapCsharpJsStringElementAccess(request, context, receiverType, host);
}

function mapCsharpJsSurfaceCheckedIteration(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  const expressionType = host.getTargetTypeRefForSubject(request.sourceExpressionType, context, csharpJsCheckedTypeQuery);
  if (request.kind === "for-of") {
    if (host.isCsharpStringType(expressionType)) {
      const fact = {
        operationId: "tsonic.csharp.js.string.codePoints",
        iterationKind: "sync",
        targetOperation: "string-code-points",
        elementType: csharpTargetNamedType("System.String"),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface string for-of maps to string code-point iteration." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.targetOperation),
      }, [{ message: "C# JS surface string iteration fact recorded after TSTS accepted for-of." }]);
    }
    return deferObservation;
  }
  if (request.kind === "for-in") {
    const objectShape = host.getCsharpObjectShapeFactForSubject(request.expression, context);
    if (objectShape !== undefined) {
      const fact = {
        operationId: "tsonic.csharp.js.objectShape.keys",
        iterationKind: "property-key",
        targetOperation: "object-shape-keys",
        elementType: csharpTargetNamedType("System.String"),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface object-shape for-in maps to finalized object-shape key storage." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.targetOperation),
      }, [{ message: "C# JS surface object-shape key iteration fact recorded after TSTS accepted for-in." }]);
    }
    if (expressionType?.kind === "array" || host.isCsharpStringType(expressionType)) {
      const fact = {
        operationId: "tsonic.csharp.js.indexable.keys",
        iterationKind: "property-key",
        targetOperation: "array-index-keys",
        elementType: csharpTargetNamedType("System.String"),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface indexable for-in maps to string index keys." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.targetOperation),
      }, [{ message: "C# JS surface index-key iteration fact recorded after TSTS accepted for-in." }]);
    }
  }
  return deferObservation;
}

function getSourceLibraryCallMembers(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(sourceMember.memberName);
    default:
      return [];
  }
}

function getSourceLibraryPropertyOperation(sourceMember: SourceLibraryMember): CheckedOperationMappingResult["operation"] | undefined {
  if (sourceMember.memberName !== "length") {
    return undefined;
  }
  if (sourceMember.declaringName === "String") {
    return getStringLengthOperation(sourceMember.declaringName);
  }
  return sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray"
    ? getArrayLengthOperation(sourceMember.declaringName)
    : undefined;
}
