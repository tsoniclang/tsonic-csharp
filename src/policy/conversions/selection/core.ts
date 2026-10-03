import {
  csharpEnumerableTargetType,
  csharpReadOnlyListTargetType,
  getCsharpJsArrayElementTargetType,
  csharpObjectTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpImplicitArrayInputElementTargetType,
  getCsharpTaskResultTargetType,
  isCsharpNeverTargetType,
  isCsharpVoidTargetType,
  isCsharpAbsenceTargetType,
  csharpCarrierAdmitsSourceAbsence,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import { csharpConversionIsApplicable } from "./expression.js";
import { namedTargetTypeImplicitlyAccepts, namedTargetTypesAreRelated, selectDelegateConversion, selectJsValueConversion, selectNullableConversion, selectRuntimeUnionConversion } from "./carriers.js";
import { selectProviderConversionOperator } from "./provider-operators.js";
import { sourcePrimitiveImplicitlyConverts } from "../source-primitives.js";
import { selectCsharpEmptyRecordConversion } from "./empty-record.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../target-model/types/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "./model.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import { getCsharpMethodValue, csharpMethodValueContractsEqual } from "../../../target-model/types/method-values.js";

export function selectCsharpConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & Pick<Partial<CsharpPolicyContext>, "objectShapes">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection {
  if (source === undefined || target === undefined) {
    return {
      kind: "rejected",
      reason:
        "C# conversion requires closed source and target representations.",
    };
  }
  if (targetTypeRefEquals(source, target)) {
    return { kind: "identity" };
  }
  if (isCsharpVoidTargetType(source)) return {
    kind: "rejected", reason: "A native void completion is not a value carrier; its checked expression owns absence admission.",
  };
  if (isCsharpAbsenceTargetType(source) && csharpCarrierAdmitsSourceAbsence(target)) {
    return { kind: "absence" };
  }
  if (isCsharpNeverTargetType(source) && !isCsharpVoidTargetType(target)) {
    return { kind: "never" };
  }
  const arrayElement = csharpArrayLikeElement(source, input.typeDefinitions);
  if (arrayElement !== undefined && targetTypeRefEquals(target, csharpArrayLikeTargetType(arrayElement))) {
    const arms = getCsharpRuntimeUnionArms(source, input.typeDefinitions);
    return arms === undefined ? { kind: "implicit", proof: "collection-interface" }
      : { kind: "array-like-union", arms };
  }
  const emptyRecord = selectCsharpEmptyRecordConversion(input, source, target);
  if (emptyRecord !== undefined) return emptyRecord;
  const jsValueConversion = selectJsValueConversion(
    source,
    target,
    input.typeDefinitions,
  );
  if (jsValueConversion !== undefined) {
    return jsValueConversion;
  }
  const nullable = selectNullableConversion(input, source, target, mode);
  if (nullable !== undefined) {
    return nullable;
  }
  const sourceMethod = getCsharpMethodValue(source);
  const targetMethod = getCsharpMethodValue(target);
  if (sourceMethod !== undefined && targetMethod !== undefined) {
    if (!csharpMethodValueContractsEqual(source, target)) return {
      kind: "rejected", reason: "Generic method values require the same exact method identity and quantified native contract.",
    };
    const owner = selectCsharpConversion(input, sourceMethod.owner, targetMethod.owner, mode);
    return owner.kind === "identity" || owner.kind === "implicit" ? owner : {
      kind: "rejected", reason: "Generic method values cannot copy, erase or replace their original native environment.",
    };
  }
  const runtimeUnion = selectRuntimeUnionConversion(input, source, target, mode);
  if (runtimeUnion !== undefined) {
    return runtimeUnion;
  }
  if (
    getCsharpTaskResultTargetType(source) !== undefined ||
    getCsharpTaskResultTargetType(target) !== undefined
  ) {
    if (namedTargetTypeImplicitlyAccepts(input, source, target, new Set())) {
      return { kind: "implicit", proof: "reference" };
    }
    return {
      kind: "rejected",
      reason:
        `Task carriers cannot be unwrapped, reinterpreted, or changed in arity without an exact target conversion relation: '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.`,
    };
  }
  const tuple = selectTupleConversion(input, source, target, mode);
  if (tuple !== undefined) {
    return tuple;
  }
  const collectionInterface = selectCollectionInterfaceConversion(
    source,
    target,
  );
  if (collectionInterface !== undefined) {
    return collectionInterface;
  }
  if (sourcePrimitiveImplicitlyConverts(target, source)) {
    return { kind: "implicit", proof: "numeric" };
  }
  if (
    mode === "explicit" &&
    source.kind === "source-primitive" &&
    target.kind === "source-primitive"
  ) {
    return { kind: "cast", proof: "numeric" };
  }
  const delegate = selectDelegateConversion(input, source, target);
  if (delegate !== undefined) {
    return delegate;
  }
  if (
    targetTypeRefEquals(target, csharpObjectTargetType()) &&
    targetTypeImplicitlyConvertsToObject(source)
  ) {
    return { kind: "implicit", proof: "reference" };
  }
  if (namedTargetTypeImplicitlyAccepts(input, source, target, new Set())) {
    return { kind: "implicit", proof: "reference" };
  }
  const providerOperator = selectProviderConversionOperator(
    input,
    source,
    target,
    mode,
  );
  if (providerOperator.kind !== "none") {
    return providerOperator;
  }
  if (
    mode === "explicit" &&
    namedTargetTypesAreRelated(input, source, target)
  ) {
    return { kind: "cast", proof: "reference" };
  }
  return {
    kind: "rejected",
    reason:
      `No exact C# ${mode} conversion relates '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.`,
  };
}

function selectTupleConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  >,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  if (source.kind !== "tuple" || target.kind !== "tuple") {
    return undefined;
  }
  if (source.elements.length !== target.elements.length) {
    return {
      kind: "rejected",
      reason: "C# tuple conversion requires equal source and target arity.",
    };
  }
  const elementConversions = source.elements.map((element, index) =>
    selectCsharpConversion(
      input,
      element,
      target.elements[index],
      mode,
    )
  );
  if (
    elementConversions.every((conversion) =>
      conversionIsImplicitlyApplicable(conversion)
    )
  ) {
    return { kind: "implicit", proof: "tuple" };
  }
  if (
    mode === "explicit" &&
    elementConversions.every((conversion) =>
      csharpConversionIsApplicable(conversion, mode)
    )
  ) {
    return { kind: "cast", proof: "tuple" };
  }
  return {
    kind: "rejected",
    reason:
      `C# tuple ${mode} conversion requires every corresponding element conversion to be applicable.`,
  };
}

export function conversionIsImplicitlyApplicable(
  selection: CsharpConversionSelection,
): boolean {
  if (selection.kind === "nullable-map") return conversionIsImplicitlyApplicable(selection.conversion);
  if (selection.kind === "implicit" && selection.proof === "runtime-union-arm") {
    return conversionIsImplicitlyApplicable(selection.sourceToArm);
  }
  return selection.kind === "identity" ||
    selection.kind === "absence" ||
    selection.kind === "union-map" && selection.coverage === "source" ||
    selection.kind === "integer-truncation" ||
    selection.kind === "empty-record" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter";
}

function targetTypeImplicitlyConvertsToObject(
  source: TargetTypeRef,
): boolean {
  switch (source.kind) {
    case "source-primitive":
    case "array":
    case "tuple":
      return true;
    case "target-named":
      return (source as CsharpTargetNamedTypeRef).csharpSpecialType !== "void";
    case "source-global":
    case "type-parameter":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

function selectCollectionInterfaceConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const jsArrayElement = getCsharpJsArrayElementTargetType(source);
  if (jsArrayElement !== undefined && targetTypeRefEquals(target, csharpReadOnlyListTargetType(jsArrayElement))) {
    return { kind: "implicit", proof: "collection-interface" };
  }
  const implicitArrayInputElement =
    getCsharpImplicitArrayInputElementTargetType(target);
  if (
    source.kind === "array" &&
    implicitArrayInputElement !== undefined &&
    targetTypeRefEquals(source.element, implicitArrayInputElement)
  ) {
    return { kind: "implicit", proof: "collection-interface" };
  }
  const element = getCsharpCollectionElementTargetType(source);
  return element !== undefined &&
      targetTypeRefEquals(target, csharpEnumerableTargetType(element))
    ? { kind: "implicit", proof: "collection-interface" }
    : undefined;
}
