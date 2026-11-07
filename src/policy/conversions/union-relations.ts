// CLR conversion proofs for runtime unions over (Host union relation, source carrier, destination carrier).
// The Host decides WHICH arm a value selects, how arms map between sums and which arm a narrowed read extracts
// (SourceUnionRelation, C-2479). This file proves only that the .NET carriers realize that relation: arm paths,
// payload conversions and absence lifting. A Source sum carrier is never entered or mapped without its Host relation:
// a missing relation is an invariant failure (I4). Arms that share one .NET carrier occupy one storage arm (Q73); a
// Host arm reaches its payload slot through the carrier's slot map, never through a carrier search.
import type { Node } from "@tsonic/tsts";
import type { SourceClosedSum, SourceProgramFacts, SourceSumFacts, SourceUnionRelation } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { collectCsharpUnionPaths, csharpUnionLeaves, isCsharpSourceSumCarrier, type CsharpUnionPathStep,
  type CsharpUnionArmMapping } from "../../target-model/types/union-relations.js";
import { csharpSourceSumStorageSlot } from "../../target-model/types/carriers/runtime-carriers.js";

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

/**
 * The WRITE relation of a use into its Host destination (relations.write, Q1): select-arm or map mode "write".
 * undefined when the use flows into no sum or writes the same sum (identity). A node that is also a narrowed read or a
 * per-arm access keeps its read relation in `relations.at`; that relation never decides the write (R3 #3).
 */
export function csharpHostUnionUse(facts: Pick<SourceProgramFacts, "relations" | "sums">, use: Node,
  convertArm?: (arm: TargetTypeRef) => CsharpConversionSelection | undefined): CsharpHostUnionUse | undefined {
  const relation = facts.relations.write(use);
  if (relation === undefined || relation.kind !== "select-arm" && relation.kind !== "map") return undefined;
  return Object.freeze({ relation, sums: facts.sums, ...(convertArm === undefined ? {} : { convertArm }) });
}

/** The narrowed-read relation at a read (relations.at): map mode "narrowed-read" or extract-arm; undefined otherwise. */
export interface CsharpHostUnionRead {
  readonly relation: Extract<SourceUnionRelation, { readonly kind: "map" | "extract-arm" }>;
  readonly sums: Pick<SourceSumFacts, "sum">;
}

export function csharpHostUnionRead(facts: Pick<SourceProgramFacts, "relations" | "sums">, read: Node): CsharpHostUnionRead | undefined {
  const relation = facts.relations.at(read);
  if (relation?.kind === "extract-arm" || relation?.kind === "map" && relation.mode === "narrowed-read") {
    return Object.freeze({ relation, sums: facts.sums });
  }
  return undefined;
}

/** The storage slot of a Host arm: a present payload slot of the sum's carrier, or the absence (Nullable lift). */
export type CsharpHostArmSelection = { readonly kind: "present"; readonly index: number } | { readonly kind: "absence" };

/**
 * Host arm `arm` of `sum` placed in `carrier`, the represented carrier of that sum (Nullable lift allowed). A present
 * arm's position among the present Host arms becomes its storage slot through the carrier's slot map (Q73: coincident
 * arms share one slot). A carrier that is not a runtime union has one storage arm: slot 0, the whole value.
 */
export function csharpSumArmSelection(sum: SourceClosedSum, arm: number, carrier: TargetTypeRef,
  definitions?: CsharpTypeDefinitions): CsharpHostArmSelection {
  const selected = sum.arms[arm];
  if (selected === undefined) throw new TypeError("A Host union relation names an arm outside its sum.");
  if (isAbsenceArm(selected.type)) return { kind: "absence" };
  const present = sum.arms.slice(0, arm).filter(candidate => !isAbsenceArm(candidate.type)).length;
  const storage = getCsharpNullableElementTargetType(carrier) ?? carrier;
  const slot = csharpSourceSumStorageSlot(storage, present);
  if (slot !== undefined) return { kind: "present", index: slot };
  const arms = csharpUnionLeaves(storage, definitions)?.filter(leaf => leaf.path.length === 1);
  if (arms === undefined) return { kind: "present", index: 0 };
  // A registered (recursive alias) or projected source union keeps one storage arm per present Host arm.
  if (arms.length !== sum.arms.filter(candidate => !isAbsenceArm(candidate.type)).length) {
    throw new TypeError("A source union carrier without a slot map must keep one storage arm per present Host arm.");
  }
  return { kind: "present", index: present };
}

function isAbsenceArm(type: SourceClosedSum["arms"][number]["type"]): boolean {
  return type.kind === "intrinsic" && type.intrinsic === "absence";
}

/**
 * Injection of a payload into a runtime union. With a Host arm selection the payload goes to exactly that arm,
 * converted by the CLR proof `convert`. Without one, the target must be a native-ordered .NET union (not a Source
 * sum): the payload's exact carrier identity path is proven there, never an applicable-arm search. A Source sum target
 * without its Host arm is an invariant failure (R3 #1, I4).
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
  if (isCsharpSourceSumCarrier(target, definitions)) throw new TypeError(
    "A value written into a Source sum carrier requires its Host write relation (relations.write, C-2479); C# never chooses the arm by carrier.");
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
  if (sourceLeaves === undefined) return undefined;
  const mappings: CsharpUnionArmMapping[] = [];
  const moved = new Set<number>();
  for (const [arm, destination] of relation.mapping.entries()) {
    // A narrowed read excludes arms (-1): those values cannot reach this use and need no payload move.
    if (destination < 0) continue;
    const from = csharpSumArmSelection(sourceSum, arm, source, definitions);
    const to = csharpSumArmSelection(destinationSum, destination, target, definitions);
    if (from.kind === "absence" || to.kind === "absence") {
      if (from.kind !== to.kind) return undefined;
      continue;
    }
    const sourceLeaf = sourceLeaves.find(leaf => leaf.path.length === 1 && leaf.path[0]!.index === from.index);
    const targetPath: readonly CsharpUnionPathStep[] | undefined = targetLeaves === undefined ? Object.freeze([])
      : targetLeaves.find(leaf => leaf.path.length === 1 && leaf.path[0]!.index === to.index)?.path;
    if (sourceLeaf === undefined || targetPath === undefined) return undefined;
    // Q73: coincident source arms share one storage slot; that slot moves once, and only to one destination slot.
    const previous = mappings.find(mapping => mapping.source[0]!.index === from.index);
    if (previous !== undefined) {
      if (previous.target.length !== targetPath.length || previous.target.some((step, index) => step.index !== targetPath[index]!.index)) return undefined;
      continue;
    }
    moved.add(from.index);
    mappings.push(Object.freeze({ carrier: sourceLeaf.carrier, source: sourceLeaf.path, target: targetPath }));
  }
  return mappings.length === 0 ? undefined : Object.freeze(mappings);
}

/**
 * A Host `map` whose source sum has ONE storage arm (coincident arms, Q73): every moved present arm must land in the
 * same destination slot, which is then a plain injection of the whole value. undefined when the source carrier is a
 * runtime union or when the arms land in different slots (not realizable by one .NET value).
 */
export function selectCsharpHostCollapsedMapSlot(
  relation: Extract<SourceUnionRelation, { readonly kind: "map" }>,
  sourceSum: SourceClosedSum,
  destinationSum: SourceClosedSum,
  source: TargetTypeRef,
  target: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
): CsharpHostArmSelection | undefined {
  if (csharpUnionLeaves(getCsharpNullableElementTargetType(source) ?? source, definitions) !== undefined) return undefined;
  let selected: CsharpHostArmSelection | undefined;
  for (const [arm, destination] of relation.mapping.entries()) {
    if (destination < 0 || isAbsenceArm(sourceSum.arms[arm]!.type)) continue;
    const to = csharpSumArmSelection(destinationSum, destination, target, definitions);
    if (to.kind === "absence") return undefined;
    if (selected !== undefined && selected.kind === "present" && selected.index !== to.index) return undefined;
    selected = to;
  }
  return selected;
}

/**
 * The CLR pair arm mapping of two native-ordered .NET unions. Conversions in this module never call it for a Source sum
 * carrier (they follow the Host relation). Remaining reader outside this module: the await completion of a union of
 * tasks (policy/operations/control-flow/await-completions.ts), pending a Host awaited-arm relation (FX-CR request).
 */
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

/**
 * Structural validation of a sealed union map (the Host decided which arm goes where): every mapping names a distinct
 * source payload slot whose carrier it carries, and a target slot (or the whole target) whose carrier equals it or, for
 * a widening write, accepts it by CLR reference conversion. The map is never re-derived from carriers.
 */
export function csharpUnionArmMappingsMatch(
  source: TargetTypeRef,
  target: TargetTypeRef,
  coverage: "source" | "target",
  mappings: readonly CsharpUnionArmMapping[],
  definitions?: CsharpTypeDefinitions,
  relates?: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
): boolean {
  if (!Array.isArray(mappings) || mappings.length === 0) return false;
  const sourceLeaves = csharpUnionLeaves(source, definitions);
  const targetLeaves = csharpUnionLeaves(target, definitions);
  if (sourceLeaves === undefined) return false;
  const samePath = (left: readonly CsharpUnionPathStep[], right: readonly CsharpUnionPathStep[]): boolean =>
    left.length === right.length && left.every((step, index) => step.index === right[index]!.index &&
      targetTypeRefEquals(step.union, right[index]!.union));
  let previous = -1;
  const reached = new Set<number>();
  for (const mapping of mappings) {
    if (!Array.isArray(mapping.source) || !Array.isArray(mapping.target)) return false;
    // One mapping per source payload slot, in source slot order (the order every producer emits).
    const position = sourceLeaves.findIndex(leaf => samePath(leaf.path, mapping.source));
    if (position <= previous || !targetTypeRefEquals(sourceLeaves[position]!.carrier, mapping.carrier)) return false;
    previous = position;
    const targetPosition = mapping.target.length === 0 ? (targetLeaves === undefined ? 0 : -1)
      : targetLeaves?.findIndex(leaf => samePath(leaf.path, mapping.target)) ?? -1;
    if (targetPosition < 0) return false;
    reached.add(targetPosition);
    const destination = targetLeaves === undefined ? target : targetLeaves[targetPosition]!.carrier;
    if (!targetTypeRefEquals(destination, mapping.carrier) &&
      !(coverage === "source" && relates?.(mapping.carrier, destination) === true)) return false;
  }
  // A widening write moves every source payload slot; a narrowed read or cast reaches every destination slot.
  return coverage === "source" ? mappings.length === sourceLeaves.length
    : reached.size === (targetLeaves?.length ?? 1);
}
