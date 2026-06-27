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
} from "../../source-library.js";
import {
  createSourceLibraryMember,
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";
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
const stringToStringSourceMember = createSourceLibraryMember("String", "toString");
const booleanToStringSourceMember = createSourceLibraryMember("Boolean", "toString");
const numberToStringSourceMember = createSourceLibraryMember("Number", "toString");
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
      ? stringTargetMembersForSourceMember(stringToStringSourceMember)
    : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
      ? booleanTargetMembersForSourceMember(booleanToStringSourceMember)
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
    ? numberTargetMembersForSourceMember(numberToStringSourceMember)
    : [];
}
