import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpUnionReferenceImplicitlyAccepts, selectCsharpRuntimeUnionProjection } from "../../policy/conversions/carriers.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpUnionArmMappingsMatch, csharpUnionPathsEqual } from "../../target-model/types/union-relations.js";
import { csharpMetadataDescriptors } from "../../target-model/metadata/immutable.js";
import { csharpCarrierAdmitsSourceAbsence, getCsharpDelegateSignature, getCsharpGenericOptionalParts,
  getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType,
  isCsharpNullableReferenceTargetType } from "../../target-model/types/index.js";
import type { CsharpConversionShapeQueries } from "../../policy/conversions/shape-queries.js";
import { csharpUnsignedIntegerCounterpart } from "../../target-model/conversions/integer-refinement.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { csharpNativeRepresentationMatches } from "../../policy/conversions/native-representation.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native-demand.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";

type CsharpUnionValidationPolicy = Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries;

const unionMappingRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." });
const unionProjectionRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union projection requires exact sealed payload and absence correspondence." });

interface CsharpConversionAdmissionInput {
  readonly kind: "enter";
  readonly source: TargetTypeRef | undefined;
  readonly target: TargetTypeRef | undefined;
  readonly selection: CsharpConversionSelection;
  readonly sourceCompletion?: CsharpNativeCompletion;
}

export function admitCsharpConversionSelection(
  policy: CsharpUnionValidationPolicy,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: CsharpConversionSelection,
  sourceCompletion?: CsharpNativeCompletion,
): CsharpConversionSelection {
  const pending: (CsharpConversionAdmissionInput |
    { readonly kind: "leave"; readonly selection: CsharpConversionSelection })[] = [{ kind: "enter", source, target, selection,
      ...(sourceCompletion === undefined ? {} : { sourceCompletion }) }];
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
    const rendering = conversionRenderingRejection(current);
    if (rendering !== undefined) return rendering;
    const sourceElement = getCsharpNullableElementTargetType(current.source);
    const targetElement = getCsharpNullableElementTargetType(current.target);
    switch (selected.kind) {
      case "identity":
        if (current.source === undefined || current.target === undefined ||
          !targetTypeRefEquals(current.source, current.target)) {
          return { kind: "rejected", reason: "C# identity conversion requires the exact same source and destination carrier." };
        }
        break;
      case "absence":
        if ((!isCsharpAbsenceTargetType(current.source) &&
          !(current.sourceCompletion?.kind === "void" && isCsharpVoidTargetType(current.source))) ||
          !csharpCarrierAdmitsSourceAbsence(current.target)) {
          return { kind: "rejected", reason: "An absence conversion requires its exact source and destination storage contracts." };
        }
        break;
      case "integer-refinement":
        if (current.source?.kind !== "source-primitive" || current.target?.kind !== "source-primitive" ||
          current.source.name !== selected.source || current.target.name !== selected.target ||
          selected.proof !== "nonnegative" || csharpUnsignedIntegerCounterpart(selected.source) !== selected.target) {
          return { kind: "rejected", reason: "Integer refinement conflicts with its exact native carriers." };
        }
        break;
      case "runtime-union-reference": {
        const arms = getCsharpRuntimeUnionArms(current.source, policy.typeDefinitions);
        if (current.target === undefined || arms === undefined || arms.length !== selected.arms.length ||
          !arms.every((arm, index) => targetTypeRefEquals(arm, selected.arms[index]!)) ||
          !targetTypeRefEquals(current.target, selected.target)) {
          return { kind: "rejected", reason: "Runtime-union reference projection conflicts with its exact selected arms and destination." };
        }
        break;
      }
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
        if (selected.proof === "native-representation") {
          if (current.source === undefined || current.target === undefined ||
            !csharpNativeRepresentationMatches(current.source, current.target)) {
            return { kind: "rejected", reason: "C# native representation conversion requires distinct closed non-generic JsValue carriers with the same canonical native render." };
          }
          break;
        }
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
      case "lifted-provider-argument-adapter":
        if (sourceElement === undefined || targetElement === undefined ||
          isCsharpNullableReferenceTargetType(current.source) || isCsharpNullableReferenceTargetType(current.target) ||
          !targetTypeRefEquals(sourceElement, selected.sourceElementType) ||
          !targetTypeRefEquals(targetElement, selected.targetElementType) ||
          !targetTypeRefEquals(sourceElement, selected.adapter.inputType) ||
          !targetTypeRefEquals(selected.adapter.resultType, targetElement)) {
          return { kind: "rejected", reason: `Exact provider argument adapter '${selected.adapter.id}' cannot be lifted without matching nullable value-carrier element types.` };
        }
        break;
      case "rejected":
      case "ambiguous":
        return selected;
    }
  }
  return selection;
}

function conversionRenderingRejection(input: CsharpConversionAdmissionInput): CsharpConversionSelection | undefined {
  const { selection, source, target } = input;
  let required: readonly (TargetTypeRef | undefined)[];
  switch (selection.kind) {
    case "never":
    case "checked-native-integer":
    case "integer-truncation":
    case "array-like-union":
    case "integer-refinement":
    case "cast":
      required = [target];
      break;
    case "exact-integer":
      required = [selection.input, selection.output];
      break;
    case "absence":
      required = [source, target, getCsharpGenericOptionalParts(target)?.operations ?? target];
      break;
    case "nullable-map":
      required = [getCsharpNullableElementTargetType(source), target];
      break;
    case "runtime-union-reference":
      required = [getCsharpNullableElementTargetType(target) ?? target];
      break;
    case "provider-argument-adapter":
      required = [selection.adapter.declaringType];
      break;
    case "lifted-provider-argument-adapter":
      required = [selection.sourceElementType, selection.targetElementType, selection.adapter.declaringType];
      break;
    case "js-value-cast":
      required = selection.runtimeUnionArms ?? [target];
      break;
    case "implicit":
      required = selection.proof === "checked-floating-literal" ? [target]
        : selection.proof === "runtime-union-arm" ? [getCsharpGenericOptionalParts(target)?.operations ?? getCsharpNullableElementTargetType(target) ?? target]
        : [];
      break;
    default:
      required = [];
  }
  return required.some(type => type === undefined || csharpTargetTypeRenderingRejection(type) !== undefined)
    ? { kind: "rejected", reason: "C# conversion requires a renderable target type." } : undefined;
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
