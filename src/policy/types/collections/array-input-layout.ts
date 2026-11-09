import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpNativeTypeIdentity } from "../../../target-model/types/equality.js";
import { csharpJsArrayCarrierId } from "../../../target-model/types/carriers/js.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";

export function csharpArrayInputDomainsEqual(identity: CsharpNativeTypeIdentity,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): boolean {
  if (source === undefined || target === undefined || source.kind !== target.kind) return false;
  let sourceElement: TargetTypeRef | undefined;
  let targetElement: TargetTypeRef | undefined;
  if (source.kind === "array" && target.kind === "array") {
    if (source.rank !== target.rank) return false;
    sourceElement = source.element;
    targetElement = target.element;
  } else if (source.kind === "target-named" && target.kind === "target-named" &&
    source.id === csharpJsArrayCarrierId && target.id === csharpJsArrayCarrierId) {
    sourceElement = getCsharpJsArrayElementTargetType(source);
    targetElement = getCsharpJsArrayElementTargetType(target);
  }
  if (sourceElement === undefined || targetElement === undefined) return false;
  return targetTypeRefEquals(identity, sourceElement, targetElement);
}
