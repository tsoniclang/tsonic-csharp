import type { TargetTypeRef } from "./model.js";
import { targetTypeRefEquals } from "./equality.js";
import { getCsharpRuntimeUnionArms } from "./runtime-carriers.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";
import { csharpMetadataDescriptors } from "../metadata/immutable.js";
import { snapshotCsharpTargetTypes } from "./snapshot.js";

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
  relates?: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
): readonly CsharpUnionArmMapping[] | undefined {
  if (coverage !== "source" && coverage !== "target") return undefined;
  const sourceArms = csharpUnionLeaves(source, definitions);
  const targetArms = csharpUnionLeaves(target, definitions);
  if (sourceArms === undefined || targetArms === undefined) return undefined;
  const mappings: CsharpUnionArmMapping[] = [];
  const selectedTargets = new Map<readonly CsharpUnionPathStep[], TargetTypeRef[]>();
  for (const arm of sourceArms) {
    const exact = targetArms.filter(candidate => targetTypeRefEquals(arm.carrier, candidate.carrier));
    const matches = exact.length > 0 ? exact : targetArms.filter(candidate => relates?.(arm.carrier, candidate.carrier) === true);
    if (matches.length > 1 || coverage === "source" && matches.length !== 1) return undefined;
    const selected = matches[0];
    if (selected === undefined) continue;
    const previous = selectedTargets.get(selected.path);
    if (previous !== undefined && (coverage === "target" || previous.some(carrier => targetTypeRefEquals(carrier, arm.carrier)))) return undefined;
    if (previous === undefined) selectedTargets.set(selected.path, [arm.carrier]);
    else previous.push(arm.carrier);
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
  try {
    if (!Array.isArray(target) || source.length !== target.length) return false;
    const slots = csharpMetadataDescriptors(target);
    if (Object.keys(slots).length !== target.length + 1) return false;
    return source.every((step, index) => {
      const selected: unknown = slots[String(index)]?.value;
      if (selected === null || typeof selected !== "object" || Array.isArray(selected)) return false;
      const fields = csharpMetadataDescriptors(selected);
      return Object.keys(fields).length === 2 && fields.index?.value === step.index && fields.union !== undefined &&
        targetTypeRefEquals(snapshotCsharpTargetTypes([fields.union.value as TargetTypeRef])[0]!, step.union);
    });
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function csharpUnionArmMappingsEqual(left: readonly CsharpUnionArmMapping[], right: readonly CsharpUnionArmMapping[]): boolean {
  try {
    if (!Array.isArray(right) || left.length !== right.length) return false;
    const slots = csharpMetadataDescriptors(right);
    if (Object.keys(slots).length !== right.length + 1) return false;
    return left.every((arm, index) => {
      const selected: unknown = slots[String(index)]?.value;
      if (selected === null || typeof selected !== "object" || Array.isArray(selected)) return false;
      const fields = csharpMetadataDescriptors(selected);
      return Object.keys(fields).length === 3 && fields.carrier !== undefined && fields.source !== undefined && fields.target !== undefined &&
        targetTypeRefEquals(snapshotCsharpTargetTypes([fields.carrier.value as TargetTypeRef])[0]!, arm.carrier) &&
        csharpUnionPathsEqual(arm.source, fields.source.value as readonly CsharpUnionPathStep[]) &&
        csharpUnionPathsEqual(arm.target, fields.target.value as readonly CsharpUnionPathStep[]);
    });
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function csharpUnionArmMappingsMatch(
  source: TargetTypeRef,
  target: TargetTypeRef,
  coverage: "source" | "target",
  mappings: readonly CsharpUnionArmMapping[],
  definitions?: CsharpTypeDefinitions,
  relates?: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
): boolean {
  const contract = selectCsharpUnionArmMapping(source, target, coverage, definitions, relates);
  return contract !== undefined && Array.isArray(mappings) && csharpUnionArmMappingsEqual(contract, mappings);
}
