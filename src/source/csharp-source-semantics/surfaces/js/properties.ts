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
  const member = getSourceLibraryPropertyMember(sourceMember);
  if (member === undefined) {
    return undefined;
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function getSourceLibraryPropertyMember(sourceMember: SourceLibraryMember): TargetMember | undefined {
  if (sourceMember.memberName !== "length") {
    return sourceMember.declaringName === "Math"
      ? getMathPropertyTargetMember(sourceMember.memberName)
      : undefined;
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
