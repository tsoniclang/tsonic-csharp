import {
  csharpExceptionTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpNullableReferenceTargetType,
  isCsharpIntegralTargetType,
  isCsharpVoidTargetType,
  csharpCarrierAdmitsSourceAbsence,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import {
  isCsharpThrowableType,
} from "../../types/resolution/target-hierarchy.js";
import { csharpLiteralIsRepresentableAs } from "../literals.js";
import { selectCsharpConversion } from "./core.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "./model.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpProviderArgumentAdapter } from "../../../providers/relations/index.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/index.js";
import { selectCsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";
import { selectCsharpRuntimeUnionProjection } from "./carriers.js";
import { selectCsharpGuardedIntegerConversion } from "../integer-refinement.js";

export function selectCsharpExpressionConversion(
  input: Pick<
    CsharpPolicyContext,
    "ast" | "typeDefinitions" | "projectTypes" | "providers" | "target" | "navigation" | "sourceFacts"
  > & Pick<Partial<CsharpPolicyContext>, "objectShapes">,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection {
  if (isCsharpVoidTargetType(source) && target !== undefined && csharpCarrierAdmitsSourceAbsence(target)) {
    return { kind: "absence" };
  }
  const selected = selectCsharpConversion(input, source, target, mode);
  if (selected.kind !== "rejected" || target === undefined) {
    return selected;
  }
  const refined = selectCsharpGuardedIntegerConversion(input, expression, source, target);
  if (refined !== undefined) return refined;
  const objectShape = input.objectShapes?.resolveNode(expression) ??
    input.objectShapes?.resolveTarget(source);
  if (
    source !== undefined &&
    objectShape !== undefined &&
    targetTypeRefEquals(objectShape.targetType, source) &&
    objectShape.implements?.some((implemented) =>
      targetTypeRefEquals(implemented, target)
    ) === true
  ) {
    return { kind: "implicit", proof: "object-shape-interface" };
  }
  const runtimeUnionArms = getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(target) ?? target, input.typeDefinitions);
  if (runtimeUnionArms !== undefined) {
    const candidates = runtimeUnionArms.flatMap((armType, armIndex) => {
      const sourceToArm = selectCsharpExpressionConversion(
        input,
        expression,
        source,
        armType,
        mode,
      );
      return csharpConversionIsApplicable(sourceToArm, mode)
        ? [{ armIndex, armType, sourceToArm }]
        : [];
    });
    if (candidates.length === 1) {
      return {
        kind: "implicit",
        proof: "runtime-union-arm",
        ...candidates[0]!,
      };
    }
    if (candidates.length > 1) {
      return {
        kind: "ambiguous",
        reason:
          "C# runtime-union expression conversion matches more than one exact arm.",
        candidateIds: candidates.map((candidate) =>
          `${candidate.armIndex}:${targetTypeRefKey(candidate.armType)}`),
      };
    }
  }
  return csharpLiteralIsRepresentableAs(input, expression, target)
    ? { kind: "implicit", proof: "literal" }
    : selected;
}

export function selectCsharpProviderArgumentConversion(
  input: Pick<
    CsharpPolicyContext,
    "ast" | "typeDefinitions" | "projectTypes" | "providers" | "target" | "navigation" | "sourceFacts"
  > & Pick<Partial<CsharpPolicyContext>, "objectShapes">,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  adapter: CsharpProviderArgumentAdapter | undefined,
): CsharpConversionSelection {
  const direct = selectCsharpExpressionConversion(
    input,
    expression,
    source,
    target,
    "implicit",
  );
  if (csharpConversionIsApplicable(direct, "implicit") || adapter === undefined) {
    return direct;
  }
  const sourceElementType = getCsharpNullableElementTargetType(source);
  const targetElementType = getCsharpNullableElementTargetType(target);
  if (
    adapter.nativeIntegerConversion === "checked" &&
    source !== undefined &&
    isCsharpIntegralTargetType(sourceElementType ?? source) &&
    isCsharpIntegralTargetType(targetElementType ?? target) &&
    (sourceElementType === undefined || targetElementType !== undefined) &&
    targetTypeRefEquals(adapter.resultType, targetElementType ?? target)
  ) {
    return { kind: "checked-native-integer" };
  }
  if (
    source !== undefined &&
    sourceElementType !== undefined &&
    targetElementType !== undefined &&
    !isCsharpNullableReferenceTargetType(source) &&
    !isCsharpNullableReferenceTargetType(target) &&
    targetTypeRefEquals(sourceElementType, adapter.inputType) &&
    targetTypeRefEquals(adapter.resultType, targetElementType)
  ) {
    return {
      kind: "lifted-provider-argument-adapter",
      adapter,
      sourceElementType,
      targetElementType,
    };
  }
  const sourceToInput = selectCsharpExpressionConversion(
    input,
    expression,
    source,
    adapter.inputType,
    "implicit",
  );
  const resultToTarget = selectCsharpConversion(
    input,
    adapter.resultType,
    target,
    "implicit",
  );
  if (
    csharpConversionIsApplicable(sourceToInput, "implicit") &&
    csharpConversionIsApplicable(resultToTarget, "implicit")
  ) {
    return {
      kind: "provider-argument-adapter",
      adapter,
      sourceToInput,
      resultToTarget,
    };
  }
  return {
    kind: "rejected",
    reason:
      `Exact provider argument adapter '${adapter.id}' cannot relate '${source === undefined ? "<unresolved>" : targetTypeRefKey(source)}' through '${targetTypeRefKey(adapter.inputType)}' and '${targetTypeRefKey(adapter.resultType)}' to '${targetTypeRefKey(target)}'.`,
  };
}

export function selectCsharpFlowReadConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  >,
  storageType: TargetTypeRef,
  selectedReadType: TargetTypeRef,
): CsharpConversionSelection {
  if (targetTypeRefEquals(storageType, selectedReadType)) return { kind: "identity" };
  const nullableElement = getCsharpNullableElementTargetType(storageType);
  if (nullableElement !== undefined && targetTypeRefEquals(nullableElement, selectedReadType)) {
    return isCsharpNullableReferenceTargetType(storageType)
      ? { kind: "nullable-reference" }
      : { kind: "nullable-value", asserted: false };
  }
  const runtimeUnionArms = getCsharpRuntimeUnionArms(nullableElement ?? storageType, input.typeDefinitions);
  if (runtimeUnionArms !== undefined) {
    const targetElement = getCsharpNullableElementTargetType(selectedReadType);
    const mapping = targetElement !== undefined && nullableElement === undefined ? undefined
      : selectCsharpUnionArmMapping(nullableElement ?? storageType, targetElement ?? selectedReadType, "target", input.typeDefinitions);
    if (mapping !== undefined) return { kind: "union-map", coverage: "target", arms: mapping };
    return selectCsharpRuntimeUnionProjection(input, storageType, selectedReadType);
  }
  if (
    targetTypeRefEquals(storageType, csharpExceptionTargetType()) &&
    isCsharpThrowableType(input, selectedReadType)
  ) {
    return { kind: "cast", proof: "reference" };
  }
  const selected = selectCsharpConversion(
    input,
    storageType,
    selectedReadType,
    "explicit",
  );
  return csharpConversionIsApplicable(selected, "explicit")
    ? selected
    : {
        kind: "rejected",
        reason:
          `The exact source flow narrows '${targetTypeRefKey(storageType)}' to '${targetTypeRefKey(selectedReadType)}', but C# has no closed storage-read projection for that relation.`,
      };
}

export function csharpConversionIsApplicable(
  selection: CsharpConversionSelection,
  mode: CsharpConversionMode,
): boolean {
  if (selection.kind === "nullable-map") return csharpConversionIsApplicable(selection.conversion, mode);
  return selection.kind === "identity" ||
    selection.kind === "absence" ||
    selection.kind === "union-map" && (selection.coverage === "source" || mode === "explicit") ||
    selection.kind === "never" ||
    selection.kind === "checked-native-integer" ||
    selection.kind === "exact-integer" ||
    selection.kind === "integer-refinement" ||
    selection.kind === "integer-truncation" ||
    selection.kind === "array-like-union" ||
    selection.kind === "runtime-union-reference" ||
    selection.kind === "empty-record" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter" ||
    selection.kind === "provider-argument-adapter" ||
    selection.kind === "lifted-provider-argument-adapter" ||
    selection.kind === "nullable-value" ||
    selection.kind === "nullable-reference" ||
    selection.kind === "runtime-union-projection" ||
    selection.kind === "js-value-box" ||
    selection.kind === "js-value-cast" ||
    mode === "explicit" && selection.kind === "cast";
}
