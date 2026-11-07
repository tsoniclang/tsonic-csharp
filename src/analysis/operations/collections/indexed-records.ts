import type { Node } from "@tsonic/tsts";
import { sourceMemberAccess } from "../../program/source-facts.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import { csharpSourceProfileDiagnostic } from "../../../policy/operations/source-profiles/source-profile-policy.js";

import { isCsharpRecordDictionaryTargetType, targetTypeRefEquals } from "../../../target-model/types/index.js";

import { indexedRecordMember } from "../../../policy/operations/collections/indexed-records.js";

/** `record[key]` through the Host-selected index signature (values.elementAccess), on a native dictionary carrier. */
export function selectCsharpIndexedRecordElement(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfileElementPolicyResult | undefined {
  const source = host.facts.values.elementAccess(access);
  const receiver = host.types.represent(source.receiverType, source.receiver, "value");
  if (receiver.kind === "csharp-refused" || !isCsharpRecordDictionaryTargetType(receiver)) return undefined;
  const [key, value] = receiver.typeArguments ?? [];
  const index = host.types.represent(source.index, source.node, "value");
  if (key === undefined || value === undefined || index.kind === "csharp-refused" || !targetTypeRefEquals(index, key) ||
    source.selected.kind !== "index-signature" || source.access !== "read" && source.readonly) {
    return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic("CSHARP_RECORD_INDEX_NOT_CLOSED", 9100024,
      "Indexed records require exact native key/value carriers and a writable index signature when mutated.") };
  }
  const contract = indexedRecordMember(receiver, key, value, { readonly: source.readonly });
  return {
    kind: "resolved",
    targetMember: contract.member,
    targetParameterIndex: 0,
    receiver: { kind: "instance" },
    invocation: contract.optionalRead && source.access === "read" ? { kind: "record-optional-read" } : { kind: "indexer" },
  };
}

/** `record.name` through the Host-selected string index signature (selections.memberAccess), on a native dictionary carrier. */
export function selectCsharpIndexedRecordProperty(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const source = sourceMemberAccess(host.facts, access);
  if (source.selected.kind !== "index-signature") return undefined;
  const declaration = source.selected.declaration;
  const receiver = host.types.represent(source.receiverType, source.receiver, "value");
  if (receiver.kind === "csharp-refused" || !isCsharpRecordDictionaryTargetType(receiver)) return undefined;
  const [key, value] = receiver.typeArguments ?? [];
  const index = host.facts.objects.indexes(source.receiverType).find(entry => entry.declaration === declaration);
  const selectedKey = index === undefined ? undefined : host.types.represent(index.key, source.use, "type-argument");
  if (key === undefined || value === undefined || index === undefined || selectedKey === undefined ||
    selectedKey.kind === "csharp-refused" || index.key.kind !== "string" ||
    !targetTypeRefEquals(key, selectedKey) ||
    source.access !== "read" && index.readonly) {
    return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic("CSHARP_RECORD_INDEX_NOT_CLOSED", 9100024,
      "Named records require their exact string index signature, native value carrier and writable storage when mutated.") };
  }
  const contract = indexedRecordMember(receiver, key, value, { readonly: index.readonly });
  return { kind: "resolved", targetMember: contract.member, receiver: { kind: "instance" },
    invocation: { kind: "source-name-indexer", optionalRead: contract.optionalRead && source.access === "read" } };
}
