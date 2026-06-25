import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getArrayTargetMembers,
} from "../arrays.js";
import {
  getDateTargetMembers,
} from "../date.js";
import {
  getBooleanTargetMembers,
} from "../booleans.js";
import {
  getCollectionTargetMembers,
} from "../collections.js";
import {
  getJsonTargetMembers,
} from "../json.js";
import {
  getMathTargetMembers,
} from "../math.js";
import {
  getObjectRecordDictionaryTargetMembers,
  getObjectTargetMembers,
} from "../objects.js";
import {
  getRegExpTargetMembers,
} from "../regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  getStringTargetMembers,
} from "../strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
  isStringKeyedRecordDictionaryTargetType,
} from "./helpers.js";

export function getSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "Boolean":
      return getBooleanTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Date":
      return getDateTargetMembers(
        sourceMember.memberName,
        isNewExpression(request.call, context) ? "new" : "call",
      );
    case "JSON":
      return getJsonTargetMembers(sourceMember.memberName);
    case "Object":
      return [
        ...getObjectTargetMembers(sourceMember.memberName),
        ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
      ];
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(
        sourceMember.memberName,
        getSourceLibraryCallReceiverElementType(request, context, host) ??
          getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined),
      );
    case "Map":
    case "ReadonlyMap":
    case "Set":
    case "ReadonlySet":
      return getCollectionTargetMembers(
        sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
        getSourceLibraryCallResultTargetType(request, context, host),
      );
    default:
      return [];
  }
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (sourceMember.memberName !== "keys" && sourceMember.memberName !== "values" && sourceMember.memberName !== "entries") {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : getObjectRecordDictionaryTargetMembers(sourceMember.memberName, dictionaryType);
}
