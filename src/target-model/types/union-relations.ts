import type { TargetTypeRef } from "./model.js";
import { targetTypeRefEquals } from "./equality.js";
import { getCsharpRuntimeUnionArms } from "./runtime-carriers.js";

export interface CsharpUnionPathStep {
  readonly union: TargetTypeRef;
  readonly index: number;
}

export interface CsharpUnionArmMapping {
  readonly carrier: TargetTypeRef;
  readonly source: readonly CsharpUnionPathStep[];
  readonly target: readonly CsharpUnionPathStep[];
}

export function csharpUnionLeaves(carrier: TargetTypeRef):
  readonly { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] | undefined {
  const leaves: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] = [];
  const visit = (current: TargetTypeRef, path: readonly CsharpUnionPathStep[]): boolean => {
    if (path.some(step => targetTypeRefEquals(step.union, current))) return false;
    const alternatives = getCsharpRuntimeUnionArms(current);
    if (alternatives === undefined) {
      if (path.length === 0) return false;
      leaves.push(Object.freeze({ carrier: current, path }));
      return true;
    }
    return alternatives.length > 0 && alternatives.every((arm, index) =>
      visit(arm, Object.freeze([...path, Object.freeze({ union: current, index })])));
  };
  return visit(carrier, []) ? Object.freeze(leaves) : undefined;
}

export function selectCsharpUnionArmMapping(
  source: TargetTypeRef,
  target: TargetTypeRef,
  coverage: "source" | "target",
): readonly CsharpUnionArmMapping[] | undefined {
  if (coverage !== "source" && coverage !== "target") return undefined;
  const sourceArms = csharpUnionLeaves(source);
  const targetArms = csharpUnionLeaves(target);
  if (sourceArms === undefined || targetArms === undefined) return undefined;
  const mappings: CsharpUnionArmMapping[] = [];
  const selectedTargets = new Set<readonly CsharpUnionPathStep[]>();
  for (const arm of sourceArms) {
    const matches = targetArms.filter(candidate => targetTypeRefEquals(arm.carrier, candidate.carrier));
    if (matches.length > 1 || coverage === "source" && matches.length !== 1) return undefined;
    const selected = matches[0];
    if (selected === undefined) continue;
    if (selectedTargets.has(selected.path)) return undefined;
    selectedTargets.add(selected.path);
    mappings.push(Object.freeze({ carrier: arm.carrier, source: arm.path, target: selected.path }));
  }
  return mappings.length === 0 || coverage === "target" && selectedTargets.size !== targetArms.length
    ? undefined : Object.freeze(mappings);
}

export function csharpUnionArmMappingsEqual(left: readonly CsharpUnionArmMapping[], right: readonly CsharpUnionArmMapping[]): boolean {
  const samePath = (source: readonly CsharpUnionPathStep[], target: readonly CsharpUnionPathStep[]): boolean =>
    Array.isArray(target) && source.length === target.length && source.every((step, index) => {
      const selected = target[index];
      return selected !== undefined && selected.index === step.index && targetTypeRefEquals(selected.union, step.union);
    });
  return left.length === right.length && left.every((arm, index) => {
    const selected = right[index];
    return selected !== undefined && targetTypeRefEquals(selected.carrier, arm.carrier) &&
      samePath(arm.source, selected.source) && samePath(arm.target, selected.target);
  });
}
