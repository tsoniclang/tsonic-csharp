import type { ResolvedSourceElementAccessInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../members/selection/call-selection.js";
import type { CsharpSourceProfileElementPolicyResult } from "../source-profiles/source-profile-policy.js";
import { csharpSourceProfileDiagnostic } from "../source-profiles/source-profile-policy.js";
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
  const optional = getCsharpNullableElementTargetType(value) !== undefined ||
    getCsharpGenericOptionalParts(value) !== undefined || isCsharpJsValueTargetType(value);
  return {
    kind: "resolved",
    targetMember: { id: `tsonic.csharp.record.index:${targetTypeRefKey(receiver)}`, sourceName: "Item", targetName: "Item",
      kind: "indexer", declaringType: receiver, returnType: value, readonly: member.index.readonly,
      parameters: [{ name: "key", type: key, passingMode: "by-value" }] },
    targetParameterIndex: 0,
    receiver: { kind: "instance" },
    invocation: optional && source.accessMode === "read" ? { kind: "record-optional-read" } : { kind: "indexer" },
  };
}
