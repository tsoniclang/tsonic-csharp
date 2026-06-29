import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  booleanTargetMemberIdentityIndex,
} from "../../booleans.js";
import {
  numberTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  objectRecordDictionaryAssignTargetMembers,
  objectRecordDictionaryHasOwnTargetMembers,
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
import type {
  JsSurfaceTargetFeatureCondition,
} from "./operation-types.js";
import {
  jsSurfaceTargetFeatures,
} from "./operation-types.js";
import {
  jsSurfaceReceiverMatchesTargetFeature,
} from "./target-features.js";

const objectPrimitiveReceiverToStringRows = [
  { receiverFeature: jsSurfaceTargetFeatures.string, selectedIdentity: { key: "String.toString" }, membersBySourceIdentity: stringTargetMemberIdentityIndex },
  { receiverFeature: jsSurfaceTargetFeatures.boolean, selectedIdentity: { key: "Boolean.toString" }, membersBySourceIdentity: booleanTargetMemberIdentityIndex },
  { receiverFeature: jsSurfaceTargetFeatures.number, selectedIdentity: { key: "Number.toString" }, membersBySourceIdentity: numberTargetMemberIdentityIndex },
] as const satisfies readonly {
  readonly receiverFeature: JsSurfaceTargetFeatureCondition;
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
    receiverTypes.some((receiverType) => jsSurfaceReceiverMatchesTargetFeature(candidate.receiverFeature, {
      receiverType,
      request,
      context,
      host,
    })));
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

export function getObjectRecordDictionaryHasOwnMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryHasOwnTargetMembers(dictionaryType);
}

export function getObjectRecordDictionaryAssignMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryAssignTargetMembers(dictionaryType);
}
