import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { isCsharpRuntimeUnionTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpBigIntegerTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";
import { csharpJsArrayTargetType } from "../../target-model/types/carriers/js.js";

import { collectCsharpUnionPaths, csharpUnionLeaves, csharpUnionArmMappingsEqual, type CsharpUnionPathStep, type CsharpUnionArmMapping } from "../../target-model/types/union-relations.js";

type CsharpUnionLeaf = NonNullable<ReturnType<typeof csharpUnionLeaves>>[number];

interface CsharpUnionCandidate {
  readonly arm: CsharpUnionLeaf;
  readonly conversion: CsharpConversionSelection;
}

const nativeIntegralKinds = new Set([
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "int128", "uint128", "native-int", "native-uint",
]);

export function csharpNumericReturnBaselineCovered(input: {
  readonly source: TargetTypeRef;
  readonly baseline: TargetTypeRef;
  readonly definitions: CsharpTypeDefinitions | undefined;
  readonly convert: (source: TargetTypeRef, target: TargetTypeRef) => CsharpConversionSelection;
}): boolean {
  const results = new Map<TargetTypeRef, Map<TargetTypeRef, boolean>>();
  const covered = (source: TargetTypeRef, baseline: TargetTypeRef): boolean => {
    const known = results.get(source)?.get(baseline);
    if (known !== undefined) return known;
    const targets = results.get(source) ?? new Map<TargetTypeRef, boolean>();
    targets.set(baseline, false);
    results.set(source, targets);
    const result = select(source, baseline);
    targets.set(baseline, result);
    return result;
  };
  const select = (source: TargetTypeRef, baseline: TargetTypeRef): boolean => {
    const sourceUnion = getCsharpRuntimeUnionArms(source, input.definitions);
    const baselineUnion = getCsharpRuntimeUnionArms(baseline, input.definitions);
    if (sourceUnion !== undefined || baselineUnion !== undefined) {
      const sources = sourceUnion === undefined ? [source] : csharpUnionLeaves(source, input.definitions)?.map(leaf => leaf.carrier);
      const alternatives = baselineUnion === undefined ? [baseline] : csharpUnionLeaves(baseline, input.definitions)?.map(leaf => leaf.carrier);
      return sources !== undefined && alternatives !== undefined && sources.length > 0 && alternatives.length > 0 &&
        sources.every(source => alternatives.some(target => covered(source, target))) &&
        alternatives.every(target => sources.some(source => covered(source, target)));
    }
    const sourcePresent = getCsharpNullableElementTargetType(source);
    const baselinePresent = getCsharpNullableElementTargetType(baseline);
    if (sourcePresent !== undefined || baselinePresent !== undefined) return sourcePresent !== undefined &&
      baselinePresent !== undefined && covered(sourcePresent, baselinePresent);
    if (source.kind === "source-primitive") {
      if (targetTypeRefEquals(source, baseline)) return true;
      if (nativeIntegralKinds.has(source.name) && targetTypeRefEquals(baseline, csharpBigIntegerTargetType())) return true;
      return baseline.kind === "source-primitive" && baseline.name === "float64" &&
        (nativeIntegralKinds.has(source.name) || source.name === "float32") && csharpConversionIsApplicable(input.convert(source, baseline), "implicit");
    }
    if (source.kind === "array" && baseline.kind === "array") return (source.rank ?? 1) === (baseline.rank ?? 1) && covered(source.element, baseline.element);
    if (source.kind === "tuple" && baseline.kind === "tuple") return source.elements.length === baseline.elements.length &&
      source.elements.every((element, index) => covered(element, baseline.elements[index]!));
    const sourceElement = getCsharpJsArrayElementTargetType(source);
    const baselineElement = getCsharpJsArrayElementTargetType(baseline);
    if (sourceElement !== undefined || baselineElement !== undefined) return sourceElement !== undefined && baselineElement !== undefined &&
      canonicalCollection(source, sourceElement) && canonicalCollection(baseline, baselineElement) &&
      covered(sourceElement, baselineElement);
    if (source.kind === "target-named" && baseline.kind === "target-named") {
      const sources = source.typeArguments ?? [];
      const alternatives = baseline.typeArguments ?? [];
      return sources.length === alternatives.length &&
        targetTypeRefEquals({ ...source, typeArguments: baseline.typeArguments }, baseline) &&
        sources.every((argument, index) => covered(argument, alternatives[index]!));
    }
    return targetTypeRefEquals(source, baseline);
  };
  return covered(input.source, input.baseline);

  function canonicalCollection(carrier: TargetTypeRef, element: TargetTypeRef): boolean {
    if (carrier.kind !== "target-named" || !targetTypeRefEquals(carrier, csharpJsArrayTargetType(element))) return false;
    const selected = carrier as CsharpTargetNamedTypeRef;
    return [selected.csharpArrayLiteralElementType, selected.csharpEnumerableElementType, selected.csharpArrayLikeElementType,
      selected.csharpReadOnlyIndexableElementType, selected.csharpDenseMutableElementType]
      .every(type => type !== undefined && targetTypeRefEquals(type, element));
  }
}

export function csharpSourceUnionLayoutsMatch(source: TargetTypeRef, target: TargetTypeRef): boolean {
  const results = new Map<TargetTypeRef, Map<TargetTypeRef, boolean>>();
  const matches = (source: TargetTypeRef, target: TargetTypeRef): boolean => {
    if (targetTypeRefEquals(source, target)) return true;
    const known = results.get(source)?.get(target);
    if (known !== undefined) return known;
    const targets = results.get(source) ?? new Map<TargetTypeRef, boolean>();
    targets.set(target, false);
    results.set(source, targets);
    const selected = (source: TargetTypeRef, target: TargetTypeRef): boolean => {
      const sourcePresent = getCsharpNullableElementTargetType(source);
      const targetPresent = getCsharpNullableElementTargetType(target);
      if (sourcePresent !== undefined || targetPresent !== undefined) return sourcePresent !== undefined &&
        targetPresent !== undefined && matches(sourcePresent, targetPresent);
      if (isCsharpRuntimeUnionTargetType(source) && isCsharpRuntimeUnionTargetType(target)) {
        const sources = csharpUnionLeaves(source);
        const alternatives = csharpUnionLeaves(target);
        if (sources === undefined || alternatives === undefined || sources.length !== alternatives.length) return false;
        const used = new Set<number>();
        for (const source of sources) {
          const candidates = alternatives.flatMap((target, index) => matches(source.carrier, target.carrier) ? [index] : []);
          if (candidates.length !== 1 || used.has(candidates[0]!)) return false;
          used.add(candidates[0]!);
        }
        return used.size === alternatives.length;
      }
      if (source.kind === "array" && target.kind === "array") return (source.rank ?? 1) === (target.rank ?? 1) &&
        matches(source.element, target.element);
      if (source.kind === "tuple" && target.kind === "tuple") return source.elements.length === target.elements.length &&
        source.elements.every((element, index) => matches(element, target.elements[index]!));
      if (source.kind === "target-named" && target.kind === "target-named") {
        const sources = source.typeArguments ?? [];
        const alternatives = target.typeArguments ?? [];
        return sources.length > 0 && sources.length === alternatives.length &&
          targetTypeRefEquals({ ...source, typeArguments: target.typeArguments }, target) &&
          sources.every((argument, index) => matches(argument, alternatives[index]!));
      }
      return false;
    };
    const result = selected(source, target);
    targets.set(target, result);
    return result;
  };
  return matches(source, target);
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
