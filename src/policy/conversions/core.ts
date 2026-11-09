import { csharpEnumerableTargetType, csharpReadOnlyListTargetType, getCsharpJsArrayElementTargetType, getCsharpCollectionElementTargetType, getCsharpImplicitArrayInputElementTargetType, getCsharpTaskResultTargetType, isCsharpNeverTargetType, isCsharpVoidTargetType, isCsharpAbsenceTargetType, csharpCarrierAdmitsSourceAbsence, targetTypeRefEquals, targetTypeRefKey, csharpDelegateSignatureHasSupportedPassingModes, csharpDelegateSignaturesMatchNativeBinding, isCsharpNullableReferenceTargetType, isCsharpValueTypeTargetType } from "../../target-model/types/index.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { selectProviderConversionOperator } from "./provider-operators.js";
import { sourcePrimitiveImplicitlyConverts } from "./source-primitives.js";
import { selectCsharpEmptyRecordConversion } from "./empty-record.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../target-model/types/carriers/array-like.js";
import { getCsharpRuntimeUnionArms, isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpConversionMode, CsharpConversionRelation, CsharpConversionSelection, CsharpNativeCallableConversionMembers } from "../../target-model/conversions/selection.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../types/index.js";
import type { CsharpConversionShapeQueries } from "./shape-queries.js";
import { getCsharpMethodValue, csharpMethodValueContractsEqual } from "../../target-model/types/method-values.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpNativeCallableApplicationIsValid } from "./generic-callable.js";
import { csharpVoidReturnCompletion } from "./callable-completions.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { csharpUnionProjectionPath, selectCsharpUnionArmMapping, selectCsharpUnionInjection } from "./union-relations.js";
import { csharpNativeRepresentationMatches } from "./native-representation.js";
import { csharpNativeCallableMemberKey, getCsharpCallableMembers } from "../../target-model/types/carriers/delegates.js";
import { csharpObjectShapeImplicitlyAccepts, csharpUnionReferenceImplicitlyAccepts, namedTargetTypeImplicitlyAccepts, namedTargetTypesAreRelated } from "../constraints/native-relations.js";

export function selectCsharpConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & CsharpConversionShapeQueries,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
  callable?: CsharpNativeCallableConversionMembers,
): CsharpConversionRelation {
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
  if (isCsharpRefLikeTargetType(source) && !isCsharpRefLikeTargetType(target)) {
    const native = selectProviderConversionOperator(input, source, target, mode);
    if (native.kind !== "none") return native;
    return { kind: "rejected", code: "CSHARP_REFLIKE_BOXING",
      reason: "A native ref-like value cannot be boxed or erased into an ordinary value carrier without an exact non-boxing native conversion." };
  }
  const arrayElement = csharpArrayLikeElement(source);
  if (arrayElement !== undefined && targetTypeRefEquals(target, csharpArrayLikeTargetType(arrayElement))) {
    const arms = getCsharpRuntimeUnionArms(source);
    return arms === undefined ? { kind: "implicit", proof: "collection-interface" }
      : { kind: "array-like-union", arms };
  }
  const emptyRecord = selectCsharpEmptyRecordConversion(input, source, target);
  if (emptyRecord !== undefined) return emptyRecord;
  const targetShapeCarrier = getCsharpNullableElementTargetType(target) ?? target;
  if (isCsharpJsValueTargetType(source)) {
    const shape = input.objectShapes.resolveTarget(targetShapeCarrier);
    if (shape?.members.some(member => member.memberKind === "method") === true && !(shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class")) return {
      kind: "rejected", code: "CSHARP_NATIVE_METHOD_PROJECTION_UNSUPPORTED",
      reason: "A boxed value cannot project a native structural method contract. Pass a value with its declared native method interface instead.",
    };
  }
  const jsValueConversion = selectJsValueConversion(
    source,
    target,
  );
  if (jsValueConversion !== undefined) {
    return jsValueConversion;
  }
  if (csharpObjectShapeImplicitlyAccepts(input, source, target, new Set())) {
    return { kind: "implicit", proof: "object-shape-interface" };
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
  if (
    mode === "explicit" &&
    source.kind === "source-primitive" &&
    target.kind === "source-primitive"
  ) {
    return { kind: "cast", proof: "numeric" };
  }
  if (sourcePrimitiveImplicitlyConverts(target, source)) {
    return { kind: "implicit", proof: "numeric" };
  }
  if (namedTargetTypeImplicitlyAccepts(input, source, target, new Set())) {
    return { kind: "implicit", proof: "reference" };
  }
  const delegate = selectDelegateConversion(input, source, target, callable);
  if (delegate !== undefined) {
    return delegate;
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
  if (source.kind === "target-named" && target.kind === "target-named" && source.id === target.id &&
    source.typeArguments?.length === target.typeArguments?.length) {
    for (const [index, argument] of (source.typeArguments ?? []).entries()) {
      const required = target.typeArguments?.[index];
      if (required === undefined || targetTypeRefEquals(argument, required)) continue;
      const relation = selectCsharpConversion(input, argument, required, mode);
      if (relation.kind === "rejected") return relation;
    }
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
  > & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionRelation | undefined {
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
  selection: CsharpConversionRelation | CsharpConversionSelection,
): boolean {
  if (selection.kind === "nullable-map") return conversionIsImplicitlyApplicable(selection.conversion);
  if (selection.kind === "implicit" && selection.proof === "runtime-union-arm") {
    return conversionIsImplicitlyApplicable(selection.sourceToArm);
  }
  return selection.kind === "identity" ||
    selection.kind === "source-erasure-required" || selection.kind === "js-value-box" ||
    selection.kind === "absence" ||
    selection.kind === "union-map" && selection.coverage === "source" ||
    selection.kind === "integer-truncation" ||
    selection.kind === "empty-record" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter";
}

function selectCollectionInterfaceConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionRelation | undefined {
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

export function selectJsValueConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionRelation | undefined {
  const sourceJsValue = isCsharpJsValueTargetType(source);
  const targetJsValue = isCsharpJsValueTargetType(target);
  if (!sourceJsValue && !targetJsValue) {
    return undefined;
  }
  if (sourceJsValue && targetJsValue) {
    if (targetTypeRefEquals(source, target)) return { kind: "identity" };
    return csharpNativeRepresentationMatches(source, target)
      ? { kind: "implicit", proof: "native-representation" }
      : { kind: "rejected", reason: "C# JsValue conversion requires one exact closed non-generic native representation." };
  }
  if (targetJsValue) {
    return { kind: "source-erasure-required", source, target };
  }
  return {
    kind: "js-value-cast",
    ...(getCsharpRuntimeUnionArms(target) === undefined
      ? {}
      : { runtimeUnionArms: getCsharpRuntimeUnionArms(target) }),
  };
}

export function selectRuntimeUnionConversion(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers" | "target"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionRelation | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  if (mode === "explicit" && sourceElement !== undefined && getCsharpRuntimeUnionArms(sourceElement) !== undefined &&
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(target) ?? target) === undefined) {
    return selectCsharpRuntimeUnionProjection(input, source, target);
  }
  const sourceArms = getCsharpRuntimeUnionArms(source);
  const targetArms = getCsharpRuntimeUnionArms(target);
  const completeInjection = selectCsharpUnionInjection(source, target, mode, () => undefined);
  if (completeInjection !== undefined) return completeInjection;
  const widening = selectCsharpUnionArmMapping(source, target, "source",
    (sourceArm, targetArm) => csharpUnionReferenceImplicitlyAccepts(input, sourceArm, targetArm));
  if (widening !== undefined) return { kind: "union-map", coverage: "source", arms: widening };
  const narrowing = mode === "explicit" ? selectCsharpUnionArmMapping(source, target, "target") : undefined;
  if (narrowing !== undefined) return { kind: "union-map", coverage: "target", arms: narrowing };
  if (sourceArms !== undefined && targetArms !== undefined) return {
    kind: "rejected", reason: "C# runtime-union conversion requires the source representation to match one exact union arm. Every source arm requires unambiguous exact or native-reference payload correspondence.",
  };
  const referenceTarget = getCsharpNullableElementTargetType(target) ?? target;
  if (sourceArms !== undefined && referenceTarget.kind === "target-named" &&
    !isCsharpValueTypeTargetType(referenceTarget) && sourceArms.every(arm =>
      arm.kind === "target-named" && !isCsharpValueTypeTargetType(arm) &&
      !isCsharpAbsenceTargetType(arm) &&
      (!isCsharpNullableReferenceTargetType(arm) || isCsharpNullableReferenceTargetType(target)) &&
      namedTargetTypeImplicitlyAccepts(input, getCsharpNullableElementTargetType(arm) ?? arm,
        referenceTarget, new Set()))) {
    return { kind: "runtime-union-reference", arms: sourceArms, target };
  }
  if (sourceArms !== undefined && mode === "explicit") {
    return selectCsharpRuntimeUnionProjection(input, source, target);
  }
  if (targetArms === undefined) {
    return undefined;
  }
  return selectCsharpUnionInjection(source, target, mode,
    arm => selectCsharpConversion(input, source, arm, mode)) ?? {
      kind: "rejected", reason: "C# runtime-union conversion requires the source representation to match one exact union arm.",
    };
}

export function selectCsharpRuntimeUnionProjection(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef, target: TargetTypeRef,
): CsharpConversionRelation {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  const selected = targetElement ?? target;
  const path = csharpUnionProjectionPath(sourceElement ?? source, selected);
  const related = path !== undefined ? [{ path, armType: selected }]
    : (csharpUnionLeaves(sourceElement ?? source) ?? []).flatMap(leaf =>
      selected.kind === "target-named" && leaf.carrier.kind === "target-named" &&
      !isCsharpValueTypeTargetType(selected) && !isCsharpValueTypeTargetType(leaf.carrier) &&
      namedTargetTypeImplicitlyAccepts(input, selected, leaf.carrier, new Set())
        ? [{ path: leaf.path, armType: leaf.carrier, refinement: selected }] : []);
  return related.length === 1 ? { kind: "runtime-union-projection", ...related[0]!, retainsAbsence: sourceElement !== undefined && targetElement !== undefined }
    : { kind: "rejected", reason: related.length === 0
      ? "Explicit C# runtime-union projection requires one exact payload or nominal refinement."
      : "Explicit C# runtime-union projection has ambiguous native payloads." };
}

export function selectNullableConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionRelation | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if (targetElement !== undefined) {
    const elementConversion = selectCsharpConversion(
      input,
      sourceElement ?? source,
      targetElement,
      mode,
    );
    if (sourceElement === undefined && isCsharpNullableReferenceTargetType(target) &&
      elementConversion.kind === "runtime-union-reference") {
      return { ...elementConversion, target };
    }
    if (conversionIsImplicitlyApplicable(elementConversion)) {
      if (sourceElement === undefined) return elementConversion.kind === "identity"
        ? { kind: "implicit", proof: "nullable" } : elementConversion;
      if (elementConversion.kind === "identity" ||
        elementConversion.kind === "implicit" && elementConversion.proof !== "runtime-union-arm") {
        return { kind: "implicit", proof: "nullable" };
      }
      return { kind: "nullable-map", sourceElement, targetElement, conversion: elementConversion };
    }
    if (mode === "explicit" && csharpConversionIsApplicable(elementConversion, mode)) {
      if (sourceElement === undefined) return elementConversion;
      return elementConversion.kind === "cast"
        ? { kind: "cast", proof: "nullable" }
        : { kind: "nullable-map", sourceElement, targetElement, conversion: elementConversion };
    }
  }
  // C# boxes a Nullable<T> to any reference type T itself boxes to: a value boxes to T, an absent value to the null
  // reference, so source absence stays the null reference the nullable carrier already represents.
  if (sourceElement !== undefined && targetElement === undefined && !isCsharpNullableReferenceTargetType(source) &&
    !targetTypeRefEquals(sourceElement, target)) {
    const boxed = selectCsharpConversion(input, sourceElement, target, "implicit");
    if (boxed.kind === "implicit" && boxed.proof === "reference") return { kind: "implicit", proof: "reference" };
  }
  if (sourceElement !== undefined && targetTypeRefEquals(sourceElement, target)) {
    return mode === "explicit"
      ? isCsharpNullableReferenceTargetType(source)
        ? { kind: "nullable-reference" }
        : { kind: "nullable-value", asserted: true }
      : {
          kind: "rejected",
          reason:
            "A nullable C# value cannot implicitly convert to its non-nullable element type.",
        };
  }
  if (
    mode === "explicit" &&
    (
      isCsharpNullableReferenceTargetType(source) ||
      isCsharpNullableReferenceTargetType(target)
    ) &&
    namedTargetTypesAreRelated(input, sourceElement ?? source, targetElement ?? target)
  ) {
    return { kind: "cast", proof: "nullable" };
  }
  return undefined;
}

export function selectDelegateConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  > & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  selected?: CsharpNativeCallableConversionMembers,
): CsharpConversionRelation | undefined {
  const sourceMembers = getCsharpCallableMembers(getCsharpNullableElementTargetType(source) ?? source);
  const targetMembers = getCsharpCallableMembers(getCsharpNullableElementTargetType(target) ?? target);
  const belongs = (members: typeof sourceMembers, member: NonNullable<typeof sourceMembers>[number]): boolean =>
    members?.some(actual => csharpNativeCallableMemberKey(actual) === csharpNativeCallableMemberKey(member) &&
      actual.typeParameters.every((parameter, index) => parameter.identity === member.typeParameters[index]?.identity &&
        parameter.declaration === member.typeParameters[index]?.declaration)) === true;
  if (selected !== undefined && (!belongs(sourceMembers, selected.sourceApplication?.original ?? selected.source) ||
    !belongs(targetMembers, selected.targetApplication?.original ?? selected.target) ||
    selected.sourceApplication !== undefined && (!csharpNativeCallableApplicationIsValid(input, selected.sourceApplication) ||
      csharpNativeCallableMemberKey(selected.sourceApplication.applied) !== csharpNativeCallableMemberKey(selected.source)) ||
    selected.targetApplication !== undefined && (!csharpNativeCallableApplicationIsValid(input, selected.targetApplication) ||
      csharpNativeCallableMemberKey(selected.targetApplication.applied) !== csharpNativeCallableMemberKey(selected.target)))) {
    return { kind: "rejected", reason: "A selected Native callable adaptation requires members of the exact physical source and target contracts." };
  }
  const sourceMember = selected?.source ?? (sourceMembers?.length === 1 ? sourceMembers[0] : undefined);
  const targetMember = selected?.target ?? (targetMembers?.length === 1 ? targetMembers[0] : undefined);
  const targetSignature = targetMember?.signature;
  const sourceSignature = sourceMember?.signature;
  if (sourceMember === undefined || targetMember === undefined || sourceSignature === undefined || targetSignature === undefined) {
    return undefined;
  }
  if (sourceMember.typeParameters.length !== 0 || targetMember.typeParameters.length !== 0) return {
    kind: "rejected", reason: "A quantified Native callable adapter requires the exact Source-selected complete Native application; no arguments are inferred from its destination.",
  };
  if (
    !csharpDelegateSignatureHasSupportedPassingModes(sourceSignature) ||
    !csharpDelegateSignatureHasSupportedPassingModes(targetSignature) ||
    sourceSignature.kind !== targetSignature.kind ||
    (sourceSignature.receiver === undefined) !== (targetSignature.receiver === undefined) ||
    sourceSignature.receiver?.passingMode !== targetSignature.receiver?.passingMode ||
    sourceSignature.parameters.length > targetSignature.parameters.length ||
    sourceSignature.parameterPassingModes.some((mode, index) => mode !== targetSignature.parameterPassingModes[index]) ||
    sourceSignature.returnPassing !== targetSignature.returnPassing ||
    sourceSignature.restParameterIndex !== targetSignature.restParameterIndex
  ) {
    return rejectedDelegateConversion(source, target);
  }
  const parameterConversions = sourceSignature.parameters.map(
    (sourceParameter, index) => selectCsharpConversion(
      input,
      targetSignature.parameters[index]!,
      sourceParameter,
      "implicit",
    ),
  );
  const receiverConversion = sourceSignature.receiver === undefined || targetSignature.receiver === undefined ? undefined
    : selectCsharpConversion(input, targetSignature.receiver.type, sourceSignature.receiver.type, "implicit");
  const sourceResult = getCsharpTaskResultTargetType(sourceSignature.returnType);
  const targetResult = getCsharpTaskResultTargetType(targetSignature.returnType);
  const returnConversion = isCsharpVoidTargetType(targetSignature.returnType) ||
    isCsharpVoidTargetType(sourceSignature.returnType) &&
      csharpVoidReturnCompletion(sourceSignature.returnType, targetSignature.returnType) === "absence"
    ? { kind: "void-return" as const }
    : sourceResult !== undefined && targetResult !== undefined &&
      !isCsharpVoidTargetType(sourceResult) && !isCsharpVoidTargetType(targetResult) &&
      !targetTypeRefEquals(sourceSignature.returnType, targetSignature.returnType)
    ? { kind: "task-return" as const, sourceResult, targetResult,
      conversion: selectCsharpConversion(input, sourceResult, targetResult, "implicit") }
    : selectCsharpConversion(
    input,
    sourceSignature.returnType,
    targetSignature.returnType,
    "implicit",
  );
  if (
    parameterConversions.some((conversion) =>
      !csharpConversionIsApplicable(conversion, "implicit")
    ) ||
    receiverConversion !== undefined && !csharpConversionIsApplicable(receiverConversion, "implicit") ||
    returnConversion.kind !== "void-return" && !csharpConversionIsApplicable(
      returnConversion.kind === "task-return" ? returnConversion.conversion : returnConversion, "implicit")
  ) {
    return rejectedDelegateConversion(source, target);
  }
  const nativeBinding = csharpDelegateSignaturesMatchNativeBinding(sourceSignature, targetSignature);
  if (!nativeBinding && (sourceSignature.returnPassing !== undefined && returnConversion.kind !== "identity" ||
    targetSignature.parameterPassingModes.some((mode, index) => mode !== "by-value" && parameterConversions[index]?.kind !== "identity") ||
    targetSignature.receiver !== undefined && targetSignature.receiver.passingMode !== "by-value" && receiverConversion?.kind !== "identity")) {
    return rejectedDelegateConversion(source, target);
  }
  return {
    kind: "delegate-adapter",
    strategy: nativeBinding ? "native-binding" : "adaptation",
    members: Object.freeze({ source: sourceMember, target: targetMember,
      ...(selected?.sourceApplication === undefined ? {} : { sourceApplication: selected.sourceApplication }),
      ...(selected?.targetApplication === undefined ? {} : { targetApplication: selected.targetApplication }) }),
    parameterConversions: Object.freeze(parameterConversions),
    ...(receiverConversion === undefined ? {} : { receiverConversion }),
    returnConversion,
  };
}

function rejectedDelegateConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionRelation {
  return {
    kind: "rejected",
    reason:
      `C# delegate conversion requires matching call shape and exact implicit parameter/return adaptations; source '${targetTypeRefKey(source)}', target '${targetTypeRefKey(target)}'.`,
  };
}
