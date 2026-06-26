import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  booleanTargetMembersForSourceName,
} from "../../booleans.js";
import {
  isCsharpNumberTargetType,
  numberTargetMembersForSourceName,
} from "../../numbers.js";
import {
  objectRecordDictionaryTargetMembersForSourceName,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../../source-library.js";
import {
  stringTargetMembersForSourceName,
} from "../../strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isStringKeyedRecordDictionaryTargetType,
} from "../helpers.js";
import {
  objectRecordDictionaryIdentityPolicy,
  objectToStringIdentityPolicy,
} from "./identities.js";

export function getObjectPrimitiveReceiverCallMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  sourceMember: SourceLibraryMember,
): readonly TargetMember[] {
  if (!sourceLibraryMemberMatches(sourceMember, objectToStringIdentityPolicy)) {
    return [];
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
    ? stringTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
    : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
      ? booleanTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
      : numberOrNoObjectPrimitiveReceiverMembers(sourceMember, receiverTypes);
}

export function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (!sourceLibraryMemberMatches(sourceMember, objectRecordDictionaryIdentityPolicy)) {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), dictionaryType);
}

function numberOrNoObjectPrimitiveReceiverMembers(
  sourceMember: SourceLibraryMember,
  receiverTypes: ReturnType<typeof getSourceLibraryCallReceiverTargetTypes>,
): readonly TargetMember[] {
  return receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
    ? numberTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
    : [];
}
