import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  booleanTargetMemberIdentityIndex,
} from "../../booleans.js";
import {
  isCsharpNumberTargetType,
  numberTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  type ObjectRecordDictionaryOperation,
  objectRecordDictionaryTargetMembersForOperation,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
  type JsSurfaceSelectedSourceIdentity,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  stringTargetMemberIdentityIndex,
} from "../../strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isStringKeyedRecordDictionaryTargetType,
} from "../helpers.js";
type ObjectPrimitiveReceiverKind = "string" | "boolean" | "number";

const objectPrimitiveReceiverToStringRows = [
  { receiver: "string", selectedIdentity: { key: "String.toString" }, membersBySourceIdentity: stringTargetMemberIdentityIndex },
  { receiver: "boolean", selectedIdentity: { key: "Boolean.toString" }, membersBySourceIdentity: booleanTargetMemberIdentityIndex },
  { receiver: "number", selectedIdentity: { key: "Number.toString" }, membersBySourceIdentity: numberTargetMemberIdentityIndex },
] as const satisfies readonly {
  readonly receiver: ObjectPrimitiveReceiverKind;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly membersBySourceIdentity: ReadonlyMap<JsSurfaceSelectedSourceIdentity["key"], readonly TargetMember[]>;
}[];

export const objectRecordDictionaryCallRows = [
  { identity: { ids: ["Object.keys"] }, operation: "keys" },
  { identity: { ids: ["Object.values"] }, operation: "values" },
  { identity: { ids: ["Object.entries"] }, operation: "entries" },
] as const satisfies readonly {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly operation: ObjectRecordDictionaryOperation;
}[];

export function getObjectPrimitiveReceiverCallMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  const row = objectPrimitiveReceiverToStringRows.find((candidate) =>
    receiverTypes.some((receiverType) => objectPrimitiveReceiverMatches(candidate.receiver, receiverType, host)));
  return row === undefined
    ? []
    : jsSurfaceTargetMembersForSelectedSourceIdentity(row.membersBySourceIdentity, row.selectedIdentity);
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

function objectPrimitiveReceiverMatches(
  receiver: ObjectPrimitiveReceiverKind,
  receiverType: ReturnType<typeof getSourceLibraryCallReceiverTargetTypes>[number],
  host: CsharpJsSurfaceHost,
): boolean {
  switch (receiver) {
    case "string":
      return host.isCsharpStringType(receiverType);
    case "boolean":
      return receiverType?.kind === "source-primitive" && receiverType.name === "bool";
    case "number":
      return isCsharpNumberTargetType(receiverType);
  }
}
