// CLR conversion proofs for runtime unions over (Host union relation, source carrier, destination carrier).
// The Host decides WHICH arm a value selects, how arms map between sums and which arm a narrowed read extracts
// (SourceUnionRelation, C-2479). This file proves only that the .NET carriers realize that relation: arm paths,
// payload conversions and absence lifting. Without a Host relation only exact carrier identity is proven.
import type { Node } from "@tsonic/tsts";
import type { SourceClosedSum, SourceProgramFacts, SourceSumFacts, SourceUnionRelation } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
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
  // Arm-to-arm CLR reference subtyping only (the caller supplies a reference-acceptance proof); never a value search.
  return alternatives.flatMap(arm => {
    const conversion = convert(arm.carrier);
    return conversion !== undefined && csharpConversionIsApplicable(conversion, mode) ? [{ arm, conversion }] : [];
  });
}

/**
 * The Host union relation at one converted use (select-arm or map), threaded through the CLR conversion proof.
 * `convertArm` is the caller's payload proof into the selected arm (the expression proof with literal admission);
 * without it the payload proof is the plain CLR conversion.
 */
export interface CsharpHostUnionUse {
  readonly relation: Extract<SourceUnionRelation, { readonly kind: "select-arm" | "map" }>;
  readonly sums: Pick<SourceSumFacts, "sum">;
  convertArm?(arm: TargetTypeRef): CsharpConversionSelection | undefined;
}

/** The Host union relation of a use when it selects an arm or maps arms; undefined for every other use. */
export function csharpHostUnionUse(facts: Pick<SourceProgramFacts, "relations" | "sums">, use: Node,
  convertArm?: (arm: TargetTypeRef) => CsharpConversionSelection | undefined): CsharpHostUnionUse | undefined {
  const relation = facts.relations.at(use);
  if (relation === undefined || relation.kind !== "select-arm" && relation.kind !== "map") return undefined;
  return Object.freeze({ relation, sums: facts.sums, ...(convertArm === undefined ? {} : { convertArm }) });
}

/** The arm a Host relation selects, by position among the PRESENT arms of the sum (absence is the Nullable lift). */
export type CsharpHostArmSelection = { readonly kind: "present"; readonly index: number } | { readonly kind: "absence" };

export function csharpHostArmSelection(relation: SourceUnionRelation | undefined, sum: SourceClosedSum): CsharpHostArmSelection | undefined {
  if (relation === undefined || relation.kind !== "select-arm" && relation.kind !== "extract-arm") return undefined;
  return csharpSumArmSelection(sum, relation.arm);
}

export function csharpSumArmSelection(sum: SourceClosedSum, arm: number): CsharpHostArmSelection {
  const selected = sum.arms[arm];
  if (selected === undefined) throw new TypeError("A Host union relation names an arm outside its sum.");
  if (selected.type.kind === "intrinsic" && selected.type.intrinsic === "absence") return { kind: "absence" };
  return { kind: "present", index: sum.arms.slice(0, arm).filter(candidate =>
    !(candidate.type.kind === "intrinsic" && candidate.type.intrinsic === "absence")).length };
}

/**
 * Injection of a payload into a runtime union. With a Host arm selection the payload goes to exactly that arm,
 * converted by the CLR proof `convert`. Without one, only an exact carrier match is proven (no arm search).
 */
export function selectCsharpUnionInjection(
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  definitions: CsharpTypeDefinitions | undefined,
  mode: CsharpConversionMode,
  convert: (target: TargetTypeRef) => CsharpConversionSelection | undefined,
  hostArm?: CsharpHostArmSelection,
): CsharpConversionSelection | undefined {
  if (hostArm !== undefined) {
    if (hostArm.kind === "absence") return undefined;
    const leaves = csharpUnionLeaves(target, definitions)?.filter(leaf => leaf.path.length === 1 && leaf.path[0]!.index === hostArm.index);
    const leaf = leaves?.length === 1 ? leaves[0]! : undefined;
    if (leaf === undefined) return { kind: "rejected", reason: "The Host-selected union arm has no runtime-union payload slot." };
    const conversion: CsharpConversionSelection | undefined = source !== undefined && targetTypeRefEquals(source, leaf.carrier)
      ? { kind: "identity" } : convert(leaf.carrier);
    if (conversion === undefined || !csharpConversionIsApplicable(conversion, mode)) return { kind: "rejected",
      reason: "The value has no CLR conversion to the payload of the Host-selected union arm." };
    return { kind: "implicit", proof: "runtime-union-arm", armIndex: hostArm.index, armType: leaf.carrier, sourceToArm: conversion };
  }
  const complete = source === undefined ? undefined : collectCsharpUnionPaths(target, definitions, source);
  if (complete === undefined || complete.length === 0) return undefined;
  if (complete.length > 1) return { kind: "rejected",
    reason: "C# runtime-union conversion matched more than one structurally identical union arm." };
  const selected = complete[0]!;
  let conversion: CsharpConversionSelection = { kind: "identity" };
  for (let index = selected.path.length - 1; index >= 0; index -= 1) {
    const step = selected.path[index]!;
    conversion = { kind: "implicit", proof: "runtime-union-arm", armIndex: step.index,
      armType: index === selected.path.length - 1 ? selected.carrier : selected.path[index + 1]!.union,
      sourceToArm: conversion };
  }
  return conversion;
}

/** A Host `map` relation (narrowed read, widening write, cast) realized as top-level arm-to-arm payload moves. */
export function selectCsharpHostArmMapping(
  relation: Extract<SourceUnionRelation, { readonly kind: "map" }>,
  sourceSum: SourceClosedSum,
  destinationSum: SourceClosedSum,
  source: TargetTypeRef,
  target: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
): readonly CsharpUnionArmMapping[] | undefined {
  if (relation.mapping.length !== sourceSum.arms.length) throw new TypeError("A Host union map must cover every source arm.");
  const sourcePresent = getCsharpNullableElementTargetType(source) ?? source;
  const targetPresent = getCsharpNullableElementTargetType(target) ?? target;
  const sourceLeaves = csharpUnionLeaves(sourcePresent, definitions);
  const targetLeaves = csharpUnionLeaves(targetPresent, definitions);
  const mappings: CsharpUnionArmMapping[] = [];
  for (const [arm, destination] of relation.mapping.entries()) {
    // A narrowed read excludes arms (-1): those values cannot reach this use and need no payload move.
    if (destination < 0) continue;
    const from = csharpSumArmSelection(sourceSum, arm);
    const to = csharpSumArmSelection(destinationSum, destination);
    if (from.kind === "absence" || to.kind === "absence") {
      if (from.kind !== to.kind) return undefined;
      continue;
    }
    const sourceLeaf = sourceLeaves === undefined ? undefined : sourceLeaves.find(leaf => leaf.path.length === 1 && leaf.path[0]!.index === from.index);
    const targetPath: readonly CsharpUnionPathStep[] | undefined = targetLeaves === undefined ? Object.freeze([])
      : targetLeaves.find(leaf => leaf.path.length === 1 && leaf.path[0]!.index === to.index)?.path;
    if (sourceLeaf === undefined || targetPath === undefined) return undefined;
    mappings.push(Object.freeze({ carrier: sourceLeaf.carrier, source: sourceLeaf.path, target: targetPath }));
  }
  return mappings.length === 0 ? undefined : Object.freeze(mappings);
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
  if (sourceArms === undefined) return undefined;
  if (targetArms === undefined) {
    if (coverage !== "source" || !sourceArms.every(arm => targetTypeRefEquals(arm.carrier, target))) return undefined;
    const targetPath: readonly CsharpUnionPathStep[] = Object.freeze([]);
    return Object.freeze(sourceArms.map(arm => Object.freeze({ carrier: arm.carrier, source: arm.path, target: targetPath })));
  }
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
