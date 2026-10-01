import type { TargetTypeRef } from "./model.js";
import { targetTypeRefEquals } from "./equality.js";
import { getCsharpRuntimeUnionArms } from "./runtime-carriers.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";

export interface CsharpUnionPathStep {
  readonly union: TargetTypeRef;
  readonly index: number;
}

export interface CsharpUnionArmMapping {
  readonly carrier: TargetTypeRef;
  readonly source: readonly CsharpUnionPathStep[];
  readonly target: readonly CsharpUnionPathStep[];
}

export function csharpUnionLeaves(carrier: TargetTypeRef, definitions?: CsharpTypeDefinitions):
  readonly { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] | undefined {
  return collectCsharpUnionPaths(carrier, definitions);
}

function collectCsharpUnionPaths(carrier: TargetTypeRef, definitions?: CsharpTypeDefinitions, target?: TargetTypeRef):
  readonly { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] | undefined {
  const leaves: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] }[] = [];
  const visit = (current: TargetTypeRef, path: readonly CsharpUnionPathStep[]): boolean => {
    if (path.some(step => targetTypeRefEquals(step.union, current))) return false;
    if (path.length > 0 && target !== undefined && targetTypeRefEquals(current, target)) {
      leaves.push(Object.freeze({ carrier: current, path }));
      return true;
    }
    const alternatives = getCsharpRuntimeUnionArms(current, definitions);
    if (alternatives === undefined) {
      if (path.length === 0) return false;
      if (target === undefined) leaves.push(Object.freeze({ carrier: current, path }));
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
  definitions?: CsharpTypeDefinitions,
): readonly CsharpUnionArmMapping[] | undefined {
  if (coverage !== "source" && coverage !== "target") return undefined;
  const sourceArms = csharpUnionLeaves(source, definitions);
  const targetArms = csharpUnionLeaves(target, definitions);
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

export function csharpUnionProjectionPath(
  source: TargetTypeRef,
  target: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
): readonly CsharpUnionPathStep[] | undefined {
  const paths = collectCsharpUnionPaths(source, definitions, target);
  return paths?.length === 1 ? paths[0]!.path : undefined;
}

export function csharpUnionPathsEqual(source: readonly CsharpUnionPathStep[], target: readonly CsharpUnionPathStep[]): boolean {
  if (!Array.isArray(target) || source.length !== target.length) return false;
  const slots = Object.getOwnPropertyDescriptors(target);
  if (Object.keys(slots).length !== target.length + 1) return false;
  return source.every((step, index) => {
    const slot = slots[String(index)];
    if (slot === undefined || !("value" in slot)) return false;
    const selected: unknown = slot.value;
    if (selected === null || typeof selected !== "object" || Array.isArray(selected)) return false;
    const fields = Object.getOwnPropertyDescriptors(selected);
    return Object.keys(fields).length === 2 && fields.index !== undefined && "value" in fields.index &&
      fields.union !== undefined && "value" in fields.union && fields.index.value === step.index &&
      targetTypeRefEquals(fields.union.value as TargetTypeRef, step.union);
  });
}

export function csharpUnionArmMappingsEqual(left: readonly CsharpUnionArmMapping[], right: readonly CsharpUnionArmMapping[]): boolean {
  return left.length === right.length && left.every((arm, index) => {
    const selected = right[index];
    return selected !== undefined && targetTypeRefEquals(selected.carrier, arm.carrier) &&
      csharpUnionPathsEqual(arm.source, selected.source) && csharpUnionPathsEqual(arm.target, selected.target);
  });
}

export function csharpUnionArmMappingsMatch(
  source: TargetTypeRef,
  target: TargetTypeRef,
  coverage: "source" | "target",
  mappings: readonly CsharpUnionArmMapping[],
  definitions?: CsharpTypeDefinitions,
): boolean {
  const contract = selectCsharpUnionArmMapping(source, target, coverage, definitions);
  return contract !== undefined && Array.isArray(mappings) && csharpUnionArmMappingsEqual(contract, mappings);
}
