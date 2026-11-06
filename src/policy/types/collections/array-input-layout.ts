import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayCarrierId } from "../../../target-model/types/carriers/js.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";

export function csharpArrayInputDomainsEqual(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): boolean {
  if (source === undefined || target === undefined || source.kind !== target.kind) return false;
  let sourceElement: TargetTypeRef | undefined;
  let targetElement: TargetTypeRef | undefined;
  if (source.kind === "array" && target.kind === "array") {
    if ((source.rank ?? 1) !== (target.rank ?? 1)) return false;
    sourceElement = source.element;
    targetElement = target.element;
  } else if (source.kind === "target-named" && target.kind === "target-named" &&
    source.id === csharpJsArrayCarrierId && target.id === csharpJsArrayCarrierId) {
    sourceElement = getCsharpJsArrayElementTargetType(source);
    targetElement = getCsharpJsArrayElementTargetType(target);
  }
  if (sourceElement === undefined || targetElement === undefined) return false;
  if (targetTypeRefEquals(sourceElement, targetElement)) return true;
  const sourceArms = sourceElement.kind === "target-named" && sourceElement.csharpRuntimeUnionSemantics === "source-sum"
    ? getCsharpRuntimeUnionArms(sourceElement) : undefined;
  const targetArms = targetElement.kind === "target-named" && targetElement.csharpRuntimeUnionSemantics === "source-sum"
    ? getCsharpRuntimeUnionArms(targetElement) : undefined;
  if (sourceArms === undefined || targetArms === undefined || sourceArms.length !== targetArms.length) return false;
  const remaining = [...targetArms];
  for (const arm of sourceArms) {
    const index = remaining.findIndex(candidate => targetTypeRefEquals(arm, candidate));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}
