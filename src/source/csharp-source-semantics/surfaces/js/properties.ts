import {
  acceptObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpTargetOperationFromMember,
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  getSourceLibraryMember,
  recordCsharpTargetOperation,
  targetOperationFromMember,
  targetProperty,
} from "./source-library.js";
import {
  getMathPropertyTargetMember,
} from "./math.js";
import {
  hasObjectTargetMember,
} from "./objects.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
  getRegExpPropertyTargetMember,
} from "./regexp.js";
import {
  rejectUnmappedCsharpJsSourceLibraryPropertyAccess,
  rejectUnsupportedCsharpJsSourceLibraryPropertyAccess,
} from "./unsupported.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  return mapCsharpSourceLibraryPropertyOperation(request, context, sourceMember, host);
}

function mapCsharpSourceLibraryPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  if (sourceMember.declaringName === "Console") {
    return undefined;
  }
  if (sourceMember.declaringName === "Object") {
    return hasObjectTargetMember(sourceMember.memberName)
      ? undefined
      : rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  if (!sourceLibraryPropertyReceiverHasClosedFacts(request, context, sourceMember, host)) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const member = getSourceLibraryPropertyMember(sourceMember);
  if (member === undefined) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function sourceLibraryPropertyReceiverHasClosedFacts(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.declaringName === "Math") {
    return true;
  }
  const receiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery),
  );
  if (sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray") {
    return receiverType?.kind === "array";
  }
  if (sourceMember.declaringName === "String") {
    return host.isCsharpStringType(receiverType);
  }
  if (sourceMember.declaringName === "RegExp") {
    return isCsharpJsRegExpRuntimeCarrier(receiverType);
  }
  return false;
}

function getSourceLibraryPropertyMember(sourceMember: SourceLibraryMember): TargetMember | undefined {
  if (sourceMember.memberName !== "length") {
    switch (sourceMember.declaringName) {
      case "Math":
        return getMathPropertyTargetMember(sourceMember.memberName);
      case "RegExp":
        return getRegExpPropertyTargetMember(sourceMember.memberName);
      default:
        return undefined;
    }
  }
  if (
    sourceMember.declaringName === "String" ||
    sourceMember.declaringName === "Array" ||
    sourceMember.declaringName === "ReadonlyArray"
  ) {
    return targetProperty(
      `tsonic.csharp.js.${sourceMember.declaringName}.length`,
      sourceMember.memberName,
      "Length",
      csharpSourcePrimitiveTargetType("int32"),
    );
  }
  return undefined;
}
