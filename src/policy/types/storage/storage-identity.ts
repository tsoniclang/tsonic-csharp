import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpNativeTypeIdentity } from "../../../target-model/types/equality.js";

export function csharpTargetStorageIdentityEquals(identity: CsharpNativeTypeIdentity,
  left: TargetTypeRef, right: TargetTypeRef): boolean {
  return identity.storageKey(left) === identity.storageKey(right);
}
