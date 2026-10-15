import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpUnionReferenceImplicitlyAccepts, selectCsharpRuntimeUnionProjection } from "../../policy/conversions/carriers.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpUnionArmMappingsMatch, csharpUnionPathsEqual } from "../../target-model/types/union-relations.js";
import { csharpMetadataDescriptors } from "../../target-model/metadata/immutable.js";
import { getCsharpDelegateSignature, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms } from "../../target-model/types/index.js";

type CsharpUnionValidationPolicy = Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">;

const unionMappingRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." });
const unionProjectionRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union projection requires exact sealed payload and absence correspondence." });

interface CsharpConversionAdmissionInput {
  readonly kind: "enter";
  readonly source: TargetTypeRef | undefined;
  readonly target: TargetTypeRef | undefined;
  readonly selection: CsharpConversionSelection;
}

export function admitCsharpConversionSelection(
  policy: CsharpUnionValidationPolicy,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: CsharpConversionSelection,
): CsharpConversionSelection {
  if (selection.kind !== "union-map" && selection.kind !== "runtime-union-projection" &&
    selection.kind !== "nullable-map" && selection.kind !== "delegate-adapter" &&
    selection.kind !== "provider-argument-adapter" &&
    !(selection.kind === "implicit" && selection.proof === "runtime-union-arm")) return selection;
  const pending: (CsharpConversionAdmissionInput |
    { readonly kind: "leave"; readonly selection: CsharpConversionSelection })[] = [{ kind: "enter", source, target, selection }];
  const active = new Set<CsharpConversionSelection>();
  const descend = (parent: CsharpConversionSelection, children: readonly CsharpConversionAdmissionInput[]): void => {
    active.add(parent);
    pending.push({ kind: "leave", selection: parent });
    for (const child of children) pending.push(child);
  };
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.kind === "leave") {
      active.delete(current.selection);
      continue;
    }
    const selected = current.selection;
    if (active.has(selected)) return { kind: "rejected", reason: "C# conversion admission requires a finite selected conversion tree." };
    const sourceElement = getCsharpNullableElementTargetType(current.source);
    const targetElement = getCsharpNullableElementTargetType(current.target);
    switch (selected.kind) {
      case "union-map":
        if (!csharpRuntimeUnionMappingMatches(policy, sourceElement ?? current.source, targetElement ?? current.target, selected) ||
          selected.coverage === "target" && targetElement !== undefined && sourceElement === undefined) return unionMappingRejected;
        break;
      case "runtime-union-projection": {
        const selectedType = targetElement ?? current.target;
        if (!csharpRuntimeUnionProjectionMatches(policy, current.source, current.target, selected) ||
          typeof selected.retainsAbsence !== "boolean" || selectedType === undefined ||
          !targetTypeRefEquals(selected.refinement ?? selected.armType, selectedType) ||
          selected.retainsAbsence && (sourceElement === undefined || targetElement === undefined)) return unionProjectionRejected;
        break;
      }
      case "nullable-map":
        if (sourceElement === undefined || targetElement === undefined ||
          !targetTypeRefEquals(sourceElement, selected.sourceElement) || !targetTypeRefEquals(targetElement, selected.targetElement)) {
          return { kind: "rejected", reason: "Nullable conversion requires its exact sealed source and destination element carriers." };
        }
        descend(selected, [{ kind: "enter", source: sourceElement, target: targetElement, selection: selected.conversion }]);
        break;
      case "implicit": {
        if (selected.proof !== "runtime-union-arm") break;
        const arm = getCsharpRuntimeUnionArms(targetElement ?? current.target, policy.typeDefinitions)?.[selected.armIndex];
        if (arm === undefined || !targetTypeRefEquals(arm, selected.armType)) {
          return { kind: "rejected", reason: "C# runtime-union construction requires one exact source arm and a renderable closed union carrier." };
        }
        descend(selected, [{ kind: "enter", source: current.source, target: arm, selection: selected.sourceToArm }]);
        break;
      }
      case "delegate-adapter": {
        const sourceSignature = getCsharpDelegateSignature(current.source);
        const targetSignature = getCsharpDelegateSignature(current.target);
        if (sourceSignature === undefined || targetSignature === undefined ||
          sourceSignature.parameters.length > targetSignature.parameters.length ||
          selected.parameterConversions.length !== sourceSignature.parameters.length) {
          return { kind: "rejected", reason: "C# delegate adaptation requires exact renderable source and target signatures." };
        }
        const children: CsharpConversionAdmissionInput[] = selected.parameterConversions.map((conversion, index) => ({
          kind: "enter", source: targetSignature.parameters[index], target: sourceSignature.parameters[index], selection: conversion,
        }));
        if (selected.returnConversion.kind !== "void-return") children.push({ kind: "enter", source: sourceSignature.returnType,
          target: targetSignature.returnType, selection: selected.returnConversion });
        descend(selected, children.reverse());
        break;
      }
      case "provider-argument-adapter":
        descend(selected, [
          { kind: "enter", source: selected.adapter.resultType, target: current.target, selection: selected.resultToTarget },
          { kind: "enter", source: current.source, target: selected.adapter.inputType, selection: selected.sourceToInput },
        ]);
        break;
      case "rejected":
      case "ambiguous":
        return selected;
    }
  }
  return selection;
}

export function csharpRuntimeUnionMappingMatches(
  policy: CsharpUnionValidationPolicy,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>,
): boolean {
  if (source === undefined || target === undefined || selection === null || typeof selection !== "object" || Array.isArray(selection)) return false;
  try {
    const fields = csharpMetadataDescriptors(selection);
    if (Object.keys(fields).length !== 3 || fields.kind?.value !== "union-map" || fields.coverage === undefined || fields.arms === undefined) return false;
    const coverage: unknown = fields.coverage.value;
    if (coverage !== "source" && coverage !== "target") return false;
    return csharpUnionArmMappingsMatch(source, target, coverage, fields.arms.value as Extract<CsharpConversionSelection, { readonly kind: "union-map" }>["arms"],
      policy.typeDefinitions, coverage === "source"
        ? (sourceArm, targetArm) => csharpUnionReferenceImplicitlyAccepts(policy, sourceArm, targetArm) : undefined);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function csharpRuntimeUnionProjectionMatches(
  policy: CsharpUnionValidationPolicy,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
): boolean {
  if (source === undefined || target === undefined) return false;
  const expected = selectCsharpRuntimeUnionProjection(policy, source, target);
  return expected.kind === "runtime-union-projection" && csharpUnionPathsEqual(expected.path, selection.path) &&
    expected.retainsAbsence === selection.retainsAbsence && targetTypeRefEquals(expected.armType, selection.armType) &&
    (expected.refinement === undefined || selection.refinement === undefined
      ? expected.refinement === selection.refinement : targetTypeRefEquals(expected.refinement, selection.refinement));
}
