import {
  acceptObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  getArrayLengthOperation,
} from "./arrays.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  getSourceLibraryMember,
  getSourceLibraryMemberFromReceiver,
} from "./source-library.js";
import {
  getStringLengthOperation,
} from "./strings.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  return mapCsharpSourceLibraryPropertyOperation(sourceMember, host);
}

export function mapCsharpReceiverSourceLibraryCheckedPropertyAccess(
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
