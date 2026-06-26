import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  booleanTargetMembersForSourceMember,
} from "../../booleans.js";
import {
  isCsharpNumberTargetType,
  numberTargetMembersForSourceMember,
} from "../../numbers.js";
import {
  objectRecordDictionaryTargetMembersForOperation,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  createSourceLibraryMember,
  sourceLibraryMemberMatches,
  sourceLibraryMemberIdSet,
} from "../../source-library.js";
import {
  stringTargetMembersForSourceMember,
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

const stringToStringSourceMember = createSourceLibraryMember("String", "toString");
const booleanToStringSourceMember = createSourceLibraryMember("Boolean", "toString");
const numberToStringSourceMember = createSourceLibraryMember("Number", "toString");
const objectRecordDictionaryCallPolicies = [
  { identity: { ids: sourceLibraryMemberIdSet(["Object.keys"]) }, operation: "keys" },
  { identity: { ids: sourceLibraryMemberIdSet(["Object.values"]) }, operation: "values" },
  { identity: { ids: sourceLibraryMemberIdSet(["Object.entries"]) }, operation: "entries" },
] as const;

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
      ? stringTargetMembersForSourceMember(stringToStringSourceMember)
    : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
      ? booleanTargetMembersForSourceMember(booleanToStringSourceMember)
      : numberOrNoObjectPrimitiveReceiverMembers(receiverTypes);
}

export function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const policy = objectRecordDictionaryCallPolicies.find((candidate) => sourceLibraryMemberMatches(sourceMember, candidate.identity));
  if (policy === undefined || !sourceLibraryMemberMatches(sourceMember, objectRecordDictionaryIdentityPolicy)) {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryTargetMembersForOperation(policy.operation, dictionaryType);
}

function numberOrNoObjectPrimitiveReceiverMembers(
  receiverTypes: ReturnType<typeof getSourceLibraryCallReceiverTargetTypes>,
): readonly TargetMember[] {
  return receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
    ? numberTargetMembersForSourceMember(numberToStringSourceMember)
    : [];
}
