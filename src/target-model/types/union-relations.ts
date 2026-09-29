import type { TargetTypeRef } from "./model.js";
import { targetTypeRefEquals } from "./equality.js";
import { getCsharpRuntimeUnionArms } from "./runtime-carriers.js";

export interface CsharpUnionArmMapping {
  readonly carrier: TargetTypeRef;
  readonly source: number;
  readonly target: number;
}

export function selectCsharpUnionArmMapping(
  source: TargetTypeRef,
  target: TargetTypeRef,
  coverage: "source" | "target",
): readonly CsharpUnionArmMapping[] | undefined {
  if (coverage !== "source" && coverage !== "target") return undefined;
  const sourceArms = getCsharpRuntimeUnionArms(source);
  const targetArms = getCsharpRuntimeUnionArms(target);
  if (sourceArms === undefined || targetArms === undefined) return undefined;
  const mappings: CsharpUnionArmMapping[] = [];
  const selectedTargets = new Set<number>();
  for (const [sourceIndex, carrier] of sourceArms.entries()) {
    const matches = targetArms.flatMap((candidate, index) => targetTypeRefEquals(carrier, candidate) ? [index] : []);
    if (matches.length > 1 || coverage === "source" && matches.length !== 1) return undefined;
    const targetIndex = matches[0];
    if (targetIndex === undefined) continue;
    if (selectedTargets.has(targetIndex)) return undefined;
    selectedTargets.add(targetIndex);
    mappings.push(Object.freeze({ carrier, source: sourceIndex, target: targetIndex }));
  }
  return mappings.length === 0 || coverage === "target" && selectedTargets.size !== targetArms.length
    ? undefined : Object.freeze(mappings);
}
