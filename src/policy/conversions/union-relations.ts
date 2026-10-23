import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpConversionIsApplicable } from "./applicability.js";

import { collectCsharpUnionPaths, csharpUnionLeaves, csharpUnionArmMappingsEqual, type CsharpUnionPathStep, type CsharpUnionArmMapping } from "../../target-model/types/union-relations.js";

type CsharpUnionLeaf = NonNullable<ReturnType<typeof csharpUnionLeaves>>[number];

interface CsharpUnionCandidate {
  readonly arm: CsharpUnionLeaf;
  readonly conversion: CsharpConversionSelection;
}

function selectCsharpUnionCandidates(
  source: TargetTypeRef | undefined,
  alternatives: readonly CsharpUnionLeaf[],
  mode: CsharpConversionMode,
  convert: (target: TargetTypeRef) => CsharpConversionSelection | undefined,
): readonly CsharpUnionCandidate[] {
  const exact = source === undefined ? [] : alternatives.filter(arm => targetTypeRefEquals(source, arm.carrier));
  if (exact.length > 0) return exact.map(arm => ({ arm, conversion: { kind: "identity" } }));
  return alternatives.flatMap(arm => {
    const conversion = convert(arm.carrier);
    return conversion !== undefined && csharpConversionIsApplicable(conversion, mode) ? [{ arm, conversion }] : [];
  });
}

export function selectCsharpUnionInjection(
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  definitions: CsharpTypeDefinitions | undefined,
  mode: CsharpConversionMode,
  convert: (target: TargetTypeRef) => CsharpConversionSelection | undefined,
): CsharpConversionSelection | undefined {
  const complete = source === undefined ? undefined : collectCsharpUnionPaths(target, definitions, source);
  const alternatives = complete !== undefined && complete.length > 0 ? complete : csharpUnionLeaves(target, definitions);
  if (alternatives === undefined) return undefined;
  const candidates = selectCsharpUnionCandidates(source, alternatives, mode, convert);
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) return {
    kind: "rejected", reason: complete !== undefined && complete.length > 0
      ? "C# runtime-union conversion matched more than one structurally identical union arm."
      : "C# runtime-union conversion has more than one applicable native payload arm.",
  };
  const selected = candidates[0]!;
  let conversion = selected.conversion;
  for (let index = selected.arm.path.length - 1; index >= 0; index -= 1) {
    const step = selected.arm.path[index]!;
    conversion = { kind: "implicit", proof: "runtime-union-arm", armIndex: step.index,
      armType: index === selected.arm.path.length - 1 ? selected.arm.carrier : selected.arm.path[index + 1]!.union,
      sourceToArm: conversion };
  }
  return conversion;
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
    const matches = selectCsharpUnionCandidates(arm.carrier, targetArms, "implicit", targetArm =>
      relates?.(arm.carrier, targetArm) === true ? { kind: "implicit", proof: "reference" } : undefined);
    if (matches.length > 1 || coverage === "source" && matches.length !== 1) return undefined;
    const selected = matches[0]?.arm;
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
