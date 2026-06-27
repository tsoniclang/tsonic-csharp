import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  booleanTargetMembersForSelectedIdentity,
} from "../../booleans.js";
import {
  isCsharpNumberTargetType,
  numberTargetMembersForSelectedIdentity,
} from "../../numbers.js";
import {
  objectRecordDictionaryTargetMembersForOperation,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";
import {
  stringTargetMembersForSelectedIdentity,
} from "../../strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isStringKeyedRecordDictionaryTargetType,
} from "../helpers.js";
const stringToStringIdentity = { key: "String.toString" } as const;
const booleanToStringIdentity = { key: "Boolean.toString" } as const;
const numberToStringIdentity = { key: "Number.toString" } as const;
export const objectRecordDictionaryCallRows = [
  { identity: { ids: ["Object.keys"] }, operation: "keys" },
  { identity: { ids: ["Object.values"] }, operation: "values" },
  { identity: { ids: ["Object.entries"] }, operation: "entries" },
] as const satisfies readonly {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly operation: ObjectRecordDictionaryOperation;
}[];

export type ObjectRecordDictionaryOperation = "keys" | "values" | "entries";

export function getObjectPrimitiveReceiverCallMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
      ? stringTargetMembersForSelectedIdentity(stringToStringIdentity)
    : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
      ? booleanTargetMembersForSelectedIdentity(booleanToStringIdentity)
      : numberOrNoObjectPrimitiveReceiverMembers(receiverTypes);
}

export function getObjectRecordDictionaryCallMembers(
  operation: ObjectRecordDictionaryOperation,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryTargetMembersForOperation(operation, dictionaryType);
}

function numberOrNoObjectPrimitiveReceiverMembers(
  receiverTypes: ReturnType<typeof getSourceLibraryCallReceiverTargetTypes>,
): readonly TargetMember[] {
  return receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
    ? numberTargetMembersForSelectedIdentity(numberToStringIdentity)
    : [];
}
