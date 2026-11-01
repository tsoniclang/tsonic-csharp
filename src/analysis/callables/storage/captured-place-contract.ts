import type { CsharpCapturedPlaceContract } from "../../../target-model/records/callables/capture-storage.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function csharpCapturedPlaceContractsEqual(
  left: CsharpCapturedPlaceContract,
  right: CsharpCapturedPlaceContract,
): boolean {
  return targetTypeRefEquals(left.type, right.type) && left.initialization === right.initialization;
}
