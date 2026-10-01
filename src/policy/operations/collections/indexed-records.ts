import type { ResolvedSourceElementAccessInfo, ResolvedSourcePropertyAccessInfo, SourceFile, TypeIndexInfo } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../members/selection/call-selection.js";
import type { CsharpSourceProfileElementPolicyResult, CsharpSourceProfilePropertyPolicyResult } from "../source-profiles/source-profile-policy.js";
import { csharpSourceProfileDiagnostic } from "../source-profiles/source-profile-policy.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpGenericOptionalParts, getCsharpNullableElementTargetType, isCsharpRecordDictionaryTargetType,
  isCsharpJsValueTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/index.js";

export function selectCsharpIndexedRecordElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileElementPolicyResult | undefined {
  const receiver = host.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  if (!isCsharpRecordDictionaryTargetType(receiver)) return undefined;
  const [key, value] = receiver.typeArguments ?? [];
  const index = host.types.resolveSelectedValue(source.argument.expression, source.argument.type, sourceFile);
  const selected = host.semantics(sourceFile).types.selectIndexedAccess(source.receiver.type, source.argument.type);
  const member = selected?.kind === "resolved" && selected.members.length === 1 ? selected.members[0] : undefined;
  if (key === undefined || value === undefined || index === undefined || !targetTypeRefEquals(index, key) ||
    member?.kind !== "index" || source.accessMode !== "read" && member.index.readonly) {
    return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic("CSHARP_RECORD_INDEX_NOT_CLOSED", 9100024,
      "Indexed records require exact native key/value carriers and a writable checked index when mutated.") };
  }
  const contract = indexedRecordMember(receiver, key, value, member.index);
  return {
    kind: "resolved",
    targetMember: contract.member,
    targetParameterIndex: 0,
    receiver: { kind: "instance" },
    invocation: contract.optionalRead && source.accessMode === "read" ? { kind: "record-optional-read" } : { kind: "indexer" },
  };
}

export function selectCsharpIndexedRecordProperty(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const index = source.selectedIndex;
  if (index === undefined) return undefined;
  const receiver = host.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  if (!isCsharpRecordDictionaryTargetType(receiver)) return undefined;
  const [key, value] = receiver.typeArguments ?? [];
  const selectedKey = host.types.resolveType(index.keyType, sourceFile);
  if (key === undefined || value === undefined || selectedKey === undefined || index.keyType === undefined || index.valueType === undefined ||
    host.semantics(sourceFile).operations.propertyAccess(source.expression)?.selectedIndex !== index ||
    !host.semantics(sourceFile).types.isStringLike(index.keyType) ||
    !targetTypeRefEquals(key, selectedKey) ||
    source.accessMode !== "read" && index.readonly) {
    return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic("CSHARP_RECORD_INDEX_NOT_CLOSED", 9100024,
      "Named records require their exact checked string index, native value carrier and writable storage when mutated.") };
  }
  const contract = indexedRecordMember(receiver, key, value, index);
  return { kind: "resolved", targetMember: contract.member, receiver: { kind: "instance" },
    invocation: { kind: "source-name-indexer", optionalRead: contract.optionalRead && source.accessMode === "read" } };
}

function indexedRecordMember(receiver: TargetTypeRef, key: TargetTypeRef, value: TargetTypeRef, index: TypeIndexInfo) {
  return { member: { id: `tsonic.csharp.record.index:${targetTypeRefKey(receiver)}`, sourceName: "Item", targetName: "Item",
    kind: "indexer" as const, declaringType: receiver, returnType: value, readonly: index.readonly,
    parameters: [{ name: "key", type: key, passingMode: "by-value" as const }] },
    optionalRead: getCsharpNullableElementTargetType(value) !== undefined ||
      getCsharpGenericOptionalParts(value) !== undefined || isCsharpJsValueTargetType(value) };
}
