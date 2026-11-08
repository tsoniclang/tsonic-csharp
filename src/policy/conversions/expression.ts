import { csharpExceptionTargetType, getCsharpNullableElementTargetType, getCsharpExpressionTreeDelegateType, getCsharpRuntimeUnionArms, isCsharpNullableReferenceTargetType, isCsharpVoidTargetType, csharpCarrierAdmitsSourceAbsence, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/index.js";
import type { SourceLiteralUnit, SourcePresence } from "@tsonic/target-api/source";
import { selectCsharpConversion } from "./core.js";
import { selectCsharpScalarConversion } from "./scalars.js";
import type { CsharpConversionMode, CsharpConversionRelation, CsharpNativeCallableConversionMembers } from "../../target-model/conversions/selection.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpProviderArgumentAdapter } from "../../target-model/conversions/selection.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/index.js";
import type { CsharpConversionShapeQueries } from "./shape-queries.js";
import { selectCsharpUnionArmMapping, selectCsharpUnionInjection } from "./union-relations.js";
import { selectCsharpRuntimeUnionProjection, selectDelegateConversion } from "./core.js";
import { selectCsharpGuardedIntegerConversion } from "./integer-refinement.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";

export function selectCsharpExpressionConversion(
  input: Pick<
    CsharpPolicyContext,
    "integerRanges" | "ast" | "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & CsharpConversionShapeQueries,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
  scalar: SourcePresence<SourceLiteralUnit>,
  callable?: CsharpNativeCallableConversionMembers,
): CsharpConversionRelation {
  if (isCsharpVoidTargetType(source) && target !== undefined && csharpCarrierAdmitsSourceAbsence(target)) {
    return { kind: "absence" };
  }
  const selected = selectCsharpScalarConversion(input, source, target, mode, scalar, callable);
  if (selected.kind !== "rejected" || target === undefined || isCsharpRefLikeTargetType(source)) {
    return selected;
  }
  const quotationDelegate = getCsharpExpressionTreeDelegateType(getCsharpNullableElementTargetType(target) ?? target);
  if (source !== undefined && quotationDelegate !== undefined &&
    (input.ast.is.IsArrowFunction(expression) || input.ast.is.IsFunctionExpression(expression))) {
    const signatureConversion = selectDelegateConversion(input, source, quotationDelegate, callable);
    if (signatureConversion !== undefined && csharpConversionIsApplicable(signatureConversion, mode)) {
      return { kind: "implicit", proof: "lambda-quotation" };
    }
  }
  const refined = selectCsharpGuardedIntegerConversion(input, expression, source, target);
  if (refined !== undefined) return refined;
  const runtimeUnionArms = getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(target) ?? target);
  if (runtimeUnionArms !== undefined) {
    const injection = selectCsharpUnionInjection(source, getCsharpNullableElementTargetType(target) ?? target,
      mode, arm => selectCsharpExpressionConversion(input, expression, source, arm, mode, scalar));
    if (injection !== undefined) return injection;
  }
  return selected;
}

export function selectCsharpProviderArgumentConversion(
  input: Pick<
    CsharpPolicyContext,
    "integerRanges" | "ast" | "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & CsharpConversionShapeQueries,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  adapter: CsharpProviderArgumentAdapter | undefined,
  scalar: SourcePresence<SourceLiteralUnit>,
  callable?: CsharpNativeCallableConversionMembers,
): CsharpConversionRelation {
  const direct = selectCsharpExpressionConversion(
    input,
    expression,
    source,
    target,
    "implicit",
    scalar,
    callable,
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
    scalar,
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
  > & CsharpConversionShapeQueries,
  storageType: TargetTypeRef,
  selectedReadType: TargetTypeRef,
  selectedThrowable: boolean,
): CsharpConversionRelation {
  if (targetTypeRefEquals(storageType, selectedReadType)) return { kind: "identity" };
  const nullableElement = getCsharpNullableElementTargetType(storageType);
  if (nullableElement !== undefined && targetTypeRefEquals(nullableElement, selectedReadType)) {
    return isCsharpNullableReferenceTargetType(storageType)
      ? { kind: "nullable-reference" }
      : { kind: "nullable-value", asserted: false };
  }
  const runtimeUnionArms = getCsharpRuntimeUnionArms(nullableElement ?? storageType);
  if (runtimeUnionArms !== undefined) {
    const targetElement = getCsharpNullableElementTargetType(selectedReadType);
    const mapping = targetElement !== undefined && nullableElement === undefined ? undefined
      : selectCsharpUnionArmMapping(nullableElement ?? storageType, targetElement ?? selectedReadType, "target");
    if (mapping !== undefined) return { kind: "union-map", coverage: "target", arms: mapping };
    return selectCsharpRuntimeUnionProjection(input, storageType, selectedReadType);
  }
  if (selectedThrowable) {
    const exception = input.providers.publishNativeIdentities(csharpExceptionTargetType());
    if (exception.kind === "resolved" && targetTypeRefEquals(storageType, exception.value)) {
      return { kind: "cast", proof: "reference" };
    }
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
