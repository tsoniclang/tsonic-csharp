import {
  csharpExceptionTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpNullableReferenceTargetType,
  isCsharpThrowableType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../types/index.js";
import { csharpLiteralIsRepresentableAs } from "../literals.js";
import { selectCsharpConversion } from "./core.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "./model.js";
import type { CsharpPolicyContext } from "../../context.js";
import type { CsharpProviderArgumentAdapter } from "../../../providers/relations/index.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/index.js";

export function selectCsharpExpressionConversion(
  input: Pick<
    CsharpPolicyContext,
    "ast" | "projectTypes" | "providers" | "target"
  > & Pick<Partial<CsharpPolicyContext>, "objectShapes">,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection {
  const selected = selectCsharpConversion(input, source, target, mode);
  if (selected.kind !== "rejected" || target === undefined) {
    return selected;
  }
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
  const runtimeUnionArms = getCsharpRuntimeUnionArms(target);
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
    "ast" | "projectTypes" | "providers" | "target"
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
    "projectTypes" | "providers" | "target"
  >,
  storageType: TargetTypeRef,
  selectedReadType: TargetTypeRef,
): CsharpConversionSelection {
  const runtimeUnionArms = getCsharpRuntimeUnionArms(storageType);
  if (runtimeUnionArms !== undefined) {
    const matchingArms = runtimeUnionArms.flatMap((armType, armIndex) =>
      targetTypeRefEquals(armType, selectedReadType)
        ? [{ armIndex, armType }]
        : []
    );
    if (matchingArms.length === 1) {
      return {
        kind: "runtime-union-projection",
        ...matchingArms[0]!,
      };
    }
    return {
      kind: "rejected",
      reason:
        matchingArms.length === 0
          ? `The exact source flow narrows '${targetTypeRefKey(storageType)}' to '${targetTypeRefKey(selectedReadType)}', which is not an exact runtime-union arm.`
          : `The exact source flow narrows '${targetTypeRefKey(storageType)}' to '${targetTypeRefKey(selectedReadType)}', which matches more than one runtime-union arm.`,
    };
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
  return selection.kind === "identity" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter" ||
    selection.kind === "provider-argument-adapter" ||
    selection.kind === "lifted-provider-argument-adapter" ||
    selection.kind === "nullable-value" ||
    selection.kind === "runtime-union-projection" ||
    selection.kind === "js-value-box" ||
    selection.kind === "js-value-cast" ||
    mode === "explicit" && selection.kind === "cast";
}
