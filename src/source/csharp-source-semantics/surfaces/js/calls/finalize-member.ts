import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  csharpTargetMemberFact,
} from "../../../target-types.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
} from "./helpers.js";
import {
  jsonObjectShapeStringifyTargetMembers,
} from "../json.js";
import {
  jsonSerializableObjectShapeForSubject,
  recordJsonSerializableObjectShapes,
} from "../json-shape-serialization.js";

export function finalizeSourceLibraryCallMemberFromRequest(
  request: CheckedCallMappingRequest,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): CsharpTargetMember | undefined {
  const csharpMember = csharpTargetMemberFact(member);
  if (csharpMember === undefined) {
    return undefined;
  }
  const requirement = csharpMember.csharpCallFinalization;
  if (requirement === undefined) {
    return csharpMember;
  }
  const argumentEvidence = request.sourceArguments[requirement.argumentIndex];
  const argumentType = getSourceLibraryCallArgumentTargetTypes(request, context, host)[requirement.argumentIndex];
  if (argumentEvidence === undefined || argumentType === undefined) {
    return undefined;
  }
  switch (requirement.kind) {
    case "closed-json-value":
      return recordJsonSerializableObjectShapes(argumentEvidence.expression, argumentType, context, host)
        ? csharpMember
        : undefined;
    case "closed-json-object-shape": {
      const shape = jsonSerializableObjectShapeForSubject(argumentEvidence.expression, argumentType, context, host);
      if (shape === undefined || !recordJsonSerializableObjectShapes(argumentEvidence.expression, shape.targetType, context, host)) {
        return undefined;
      }
      const finalized = jsonObjectShapeStringifyTargetMembers(shape.targetType)[0];
      return finalized === undefined
        ? undefined
        : {
            ...finalized,
            ...(csharpMember.sourceIdentityKeys === undefined ? {} : { sourceIdentityKeys: csharpMember.sourceIdentityKeys }),
          };
    }
  }
}
