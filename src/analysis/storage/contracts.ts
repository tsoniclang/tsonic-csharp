import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";

import { targetTypeRefEquals } from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpNativeTypeIdentity } from "../../target-model/types/equality.js";

import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";

export function csharpStorageClassificationsEqual(
  identity: CsharpNativeTypeIdentity,
  left: CsharpStorageClassifications,
  right: CsharpStorageClassifications,
): boolean {
  return left.issues.length === right.issues.length &&
    left.closedNativeContracts.length === right.closedNativeContracts.length &&
    left.closedNativeContracts.every((type, index) => targetTypeRefEquals(identity, type, right.closedNativeContracts[index]!)) &&
    left.nativeArrays.length === right.nativeArrays.length && left.nativeArrays.every((entry, index) => {
      const other = right.nativeArrays[index];
      return other !== undefined && entry.subject === other.subject && entry.storage.kind === other.storage.kind &&
        entry.storage.stride === other.storage.stride && csharpNativeMemoryLayoutsEqual(identity, entry.storage.layout, other.storage.layout);
    }) &&
    left.nativeFields.length === right.nativeFields.length &&
    left.nativeFields.every((entry, index) => {
      const other = right.nativeFields[index];
      return other !== undefined && targetTypeRefEquals(identity, entry.owner, other.owner) &&
        entry.memberName === other.memberName && entry.storageName === other.storageName &&
        csharpNativeMemoryLayoutsEqual(identity, entry.layout, other.layout);
    }) &&
    left.nativeBackings.length === right.nativeBackings.length &&
    left.nativeBackings.every((entry, index) => {
      const other = right.nativeBackings[index];
      return other !== undefined && entry.subject === other.subject && csharpNativeMemoryLayoutsEqual(identity, entry.layout, other.layout);
    }) &&
    left.contracts.length === right.contracts.length &&
    left.issues.every((candidate, index) => {
      const other = right.issues[index];
      return other !== undefined &&
        candidate.node === other.node &&
        candidate.code === other.code &&
        candidate.message === other.message;
    }) &&
    left.contracts.every((candidate, index) => {
      const other = right.contracts[index];
      return other !== undefined &&
        candidate.declaration === other.declaration &&
        optionalTargetTypeEquals(identity, candidate.targetType, other.targetType) &&
        optionalTargetTypeEquals(identity, candidate.lambdaParameterType, other.lambdaParameterType) &&
        optionalTargetTypeEquals(
          identity,
          candidate.nullableWrittenType,
          other.nullableWrittenType,
        ) &&
        targetTypeRefEquals(identity, candidate.type, other.type) &&
        candidate.typedLocationIdentity === other.typedLocationIdentity;
    });
}

function optionalTargetTypeEquals(
  identity: CsharpNativeTypeIdentity,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : targetTypeRefEquals(identity, left, right);
}
