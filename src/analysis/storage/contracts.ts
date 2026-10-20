import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";

import { targetTypeRefEquals } from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";

export function csharpStorageClassificationsEqual(
  left: CsharpStorageClassifications,
  right: CsharpStorageClassifications,
): boolean {
  return left.issues.length === right.issues.length &&
    left.closedNativeContracts.length === right.closedNativeContracts.length &&
    left.closedNativeContracts.every((type, index) => targetTypeRefEquals(type, right.closedNativeContracts[index]!)) &&
    left.nativeArrays.length === right.nativeArrays.length && left.nativeArrays.every((entry, index) => {
      const other = right.nativeArrays[index];
      return other !== undefined && entry.subject === other.subject && entry.storage.kind === other.storage.kind &&
        entry.storage.stride === other.storage.stride && csharpNativeMemoryLayoutsEqual(entry.storage.layout, other.storage.layout);
    }) &&
    left.nativeFields.length === right.nativeFields.length &&
    left.nativeFields.every((entry, index) => {
      const other = right.nativeFields[index];
      return other !== undefined && targetTypeRefEquals(entry.owner, other.owner) &&
        entry.memberName === other.memberName && entry.storageName === other.storageName &&
        csharpNativeMemoryLayoutsEqual(entry.layout, other.layout);
    }) &&
    left.nativeBackings.length === right.nativeBackings.length &&
    left.nativeBackings.every((entry, index) => {
      const other = right.nativeBackings[index];
      return other !== undefined && entry.subject === other.subject && csharpNativeMemoryLayoutsEqual(entry.layout, other.layout);
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
        optionalTargetTypeEquals(candidate.targetType, other.targetType) &&
        optionalTargetTypeEquals(candidate.lambdaParameterType, other.lambdaParameterType) &&
        optionalTargetTypeEquals(
          candidate.nullableWrittenType,
          other.nullableWrittenType,
        ) &&
        targetTypeRefEquals(candidate.type, other.type) &&
        candidate.typedLocationIdentity === other.typedLocationIdentity;
    });
}

function optionalTargetTypeEquals(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : targetTypeRefEquals(left, right);
}
