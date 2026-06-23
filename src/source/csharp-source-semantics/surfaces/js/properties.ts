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
  csharpSourcePrimitiveTargetType,
  csharpTargetMemberOperation,
  getSourceLibraryMember,
  recordCsharpTargetOperation,
} from "./source-library.js";
import {
  getStringLengthOperation,
} from "./strings.js";
import {
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
  _host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, _host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const operation = getSourceLibraryPropertyOperation(sourceMember);
  if (operation === undefined) {
    return undefined;
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operation.operationId, "property", "Length", {
    resultType: csharpSourcePrimitiveTargetType("int32"),
  }), [{ message: `C# JS surface length property operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
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
