import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import { csharpNativeCallableApplicationIsValid } from "./generic-callable.js";
import { csharpBaseTargetTypeFromBinding, csharpTargetTypeFromBinding } from "../types/storage/bindings.js";
import { csharpDelegateSignatureHasSupportedPassingModes, csharpDelegateSignaturesMatchNativeBinding, csharpObjectTargetType, csharpTargetBindingFact, getCsharpDelegateSignature, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms, isCsharpJsValueTargetType, isCsharpAbsenceTargetType, isCsharpNullableReferenceTargetType, isCsharpReferenceCarrier, isCsharpSourceDelegateTargetType, isCsharpValueTypeTargetType, isCsharpVoidTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/index.js";
import { csharpVoidReturnCompletion } from "./callable-completions.js";
import { substituteTargetTypeParameters } from "../types/resolution/substitution.js";
import { conversionIsImplicitlyApplicable, selectCsharpConversion } from "./core.js";
import { csharpConversionIsApplicable } from "./applicability.js";
import { targetBindingSubstitutions } from "./provider-operators.js";
import type { CsharpTargetBindingFact, CsharpTargetNamedTypeRef, TargetConstraint, TargetTypeParameter, TargetTypeRef } from "../types/index.js";
import type { CsharpConversionMode, CsharpConversionRelation, CsharpNativeCallableConversionMembers } from "../../target-model/conversions/selection.js";
import type { CsharpPolicyContext } from "../model/context.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { csharpUnionProjectionPath, selectCsharpUnionArmMapping, selectCsharpUnionInjection } from "./union-relations.js";
import type { CsharpConversionShapeQueries } from "./shape-queries.js";
import { csharpNativeRepresentationMatches } from "./native-representation.js";
import { csharpNativeCallableMemberKey, getCsharpCallableMembers, getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import { csharpSourcePrimitiveDotnetMetadataName } from "../../target-model/types/carriers/scalar-types.js";

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

export function csharpUnionReferenceImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return source.kind === "target-named" && target.kind === "target-named" &&
    !isCsharpValueTypeTargetType(source) && !isCsharpValueTypeTargetType(target) &&
    !isCsharpAbsenceTargetType(source) && !isCsharpAbsenceTargetType(target) &&
    (!isCsharpNullableReferenceTargetType(source) || isCsharpNullableReferenceTargetType(target)) &&
    namedTargetTypeImplicitlyAccepts(input, getCsharpNullableElementTargetType(source) ?? source,
      getCsharpNullableElementTargetType(target) ?? target, new Set());
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

export function csharpObjectShapeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  visited: Set<string>,
): boolean {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if (sourceElement !== undefined && targetElement === undefined) return false;
  const physical = sourceElement ?? source;
  const shape = input.objectShapes.resolveTarget(physical);
  return shape !== undefined && targetTypeRefEquals(shape.targetType, physical) &&
    shape.implements?.some(implemented => namedTargetTypeImplicitlyAccepts(input, implemented, targetElement ?? target, visited)) === true;
}

export function namedTargetTypesAreRelated(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return namedTargetTypeImplicitlyAccepts(input, source, target, new Set()) ||
    namedTargetTypeImplicitlyAccepts(input, target, source, new Set());
}

export function csharpTargetTypeSatisfiesNativeConstraint(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  if (source.kind !== "source-primitive") return namedTargetTypeImplicitlyAccepts(input, source, target, new Set());
  const binding = csharpTargetBindingFact(csharpProviderBindingFromResolution(
    input.providers.findTargetBindingByMetadataName(csharpSourcePrimitiveDotnetMetadataName(source.name), "ordinary")));
  return binding !== undefined && targetBindingImplementsContract(input, binding, [], target, new Set());
}

export function namedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  visited: Set<string>,
): boolean {
  if (targetTypeRefEquals(source, target)) {
    return true;
  }
  if (getCsharpNullableElementTargetType(source) !== undefined && getCsharpNullableElementTargetType(target) === undefined) {
    return false;
  }
  if (source.kind === "type-parameter") {
    const key = `${targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`;
    if (visited.has(key) || source.csharpConstraints?.kind !== "resolved") return false;
    visited.add(key);
    try {
      return source.csharpConstraints.constraints.some(constraint => constraint.kind === "type" &&
        namedTargetTypeImplicitlyAccepts(input, constraint.type, target, visited));
    } finally {
      visited.delete(key);
    }
  }
  if (targetTypeRefEquals(target, csharpObjectTargetType())) {
    return targetTypeImplicitlyConvertsToObject(source);
  }
  if (source.kind !== "target-named" || target.kind !== "target-named") {
    return false;
  }
  const key = `${targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`;
  if (visited.has(key)) {
    return false;
  }
  visited.add(key);
  try {
    if (csharpObjectShapeImplicitlyAccepts(input, source, target, visited)) {
      return true;
    }
    if (source.id === target.id) {
      return constructedNamedTargetTypeImplicitlyAccepts(
        input,
        source,
        target,
        visited,
      );
    }
    const nativeSupertypes = input.typeDefinitions.nativeSupertypes(source);
    if (nativeSupertypes?.some(supertype =>
      namedTargetTypeImplicitlyAccepts(input, supertype, target, visited)) === true) {
      return true;
    }
    const projectSupertypes = input.projectTypes.directSupertypes(source);
    if (
      projectSupertypes?.some((supertype) =>
        namedTargetTypeImplicitlyAccepts(
          input,
          supertype,
          target,
          visited,
        )
      ) === true
    ) {
      return true;
    }
    const declaredBaseType =
      (source as CsharpTargetNamedTypeRef).csharpBaseType;
    if (
      declaredBaseType !== undefined &&
      namedTargetTypeImplicitlyAccepts(
        input,
        declaredBaseType,
        target,
        visited,
      )
    ) {
      return true;
    }
    const sourceBinding = csharpTargetBindingFact(
      csharpProviderBindingFromResolution(input.providers.findTargetBindingByTargetId(source.id, "ordinary")),
    );
    if (sourceBinding === undefined) {
      return false;
    }
    return targetBindingImplementsContract(input, sourceBinding, source.typeArguments ?? [], target, visited);
  } finally {
    visited.delete(key);
  }
}

function targetBindingImplementsContract(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  binding: CsharpTargetBindingFact,
  arguments_: readonly TargetTypeRef[],
  target: TargetTypeRef,
  visited: Set<string>,
): boolean {
  const substitutions = targetBindingSubstitutions(binding, arguments_);
  const baseType = csharpBaseTargetTypeFromBinding(binding, arguments_);
  if (baseType !== undefined && namedTargetTypeImplicitlyAccepts(input, baseType, target, visited)) return true;
  return (binding.implementedContracts ?? []).some(constraint => {
    if (constraint.kind !== "implements") return false;
    const implemented = implementedConstraintType(input, constraint, substitutions);
    return implemented !== undefined && namedTargetTypeImplicitlyAccepts(input, implemented, target, visited);
  });
}

function targetTypeImplicitlyConvertsToObject(source: TargetTypeRef): boolean {
  switch (source.kind) {
    case "source-primitive":
    case "array":
    case "tuple":
      return true;
    case "target-named":
      return (source as CsharpTargetNamedTypeRef).csharpSpecialType !== "void";
    case "type-parameter":
    case "pointer":
    case "function-pointer":
    case "opaque":
      return false;
  }
}

function constructedNamedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: CsharpTargetNamedTypeRef,
  target: CsharpTargetNamedTypeRef,
  visited: Set<string>,
): boolean {
  const sourceArguments = source.typeArguments ?? [];
  const targetArguments = target.typeArguments ?? [];
  if (sourceArguments.length !== targetArguments.length) {
    return false;
  }
  if (sourceArguments.length === 0) {
    return true;
  }
  if (isCsharpSourceDelegateTargetType(source) && isCsharpSourceDelegateTargetType(target)) {
    const sourceSignature = getCsharpDelegateSignature(source)!;
    const targetSignature = getCsharpDelegateSignature(target)!;
    return sourceSignature.parameters.length === targetSignature.parameters.length &&
      sourceSignature.restParameterIndex === targetSignature.restParameterIndex &&
      sourceSignature.returnPassing === targetSignature.returnPassing &&
      sourceSignature.parameterPassingModes.every((mode, index) => mode === targetSignature.parameterPassingModes[index]) &&
      sourceSignature.parameters.every((parameter, index) =>
      csharpVariantArgumentImplicitlyAccepts(input, targetSignature.parameters[index]!, parameter, visited)) &&
      csharpVariantArgumentImplicitlyAccepts(input, sourceSignature.returnType, targetSignature.returnType, visited);
  }
  const binding = csharpTargetBindingFact(
    csharpProviderBindingFromResolution(input.providers.findTargetBindingByTargetId(source.id, "ordinary")),
  );
  const parameters = binding?.typeParameters ?? [];
  const shape = binding === undefined && source.csharpStructuralContract === true
    ? input.objectShapes.resolveTarget(source) : undefined;
  const declaration = shape?.declarationTemplate ?? shape;
  const nativeParameters = declaration?.targetType.kind === "target-named" && declaration.targetType.id === source.id
    ? declaration.targetType.typeArguments : undefined;
  return sourceArguments.every((sourceArgument, index) => {
    const targetArgument = targetArguments[index];
    const nativeParameter = nativeParameters?.length === sourceArguments.length ? nativeParameters[index] : undefined;
    return targetArgument !== undefined &&
      (nativeParameter?.kind === "type-parameter" && declaration?.covariantTypeParameterIdentities?.includes(nativeParameter.identity) === true
        ? csharpVariantArgumentImplicitlyAccepts(input, sourceArgument, targetArgument, visited)
        : typeArgumentImplicitlyAccepts(
        input,
        sourceArgument,
        targetArgument,
        parameters[index],
        visited,
      ));
  });
}

function typeArgumentImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  parameter: TargetTypeParameter | undefined,
  visited: Set<string>,
): boolean {
  if (targetTypeRefEquals(source, target)) {
    return true;
  }
  if (parameter?.variance === "out") {
    return csharpVariantArgumentImplicitlyAccepts(input, source, target, visited);
  }
  if (parameter?.variance === "in") {
    return csharpVariantArgumentImplicitlyAccepts(input, target, source, visited);
  }
  return false;
}

export function csharpVariantArgumentImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries,
  source: TargetTypeRef,
  target: TargetTypeRef,
  visited: Set<string>,
): boolean {
  return targetTypeRefEquals(source, target) ||
    isCsharpReferenceCarrier(source) && isCsharpReferenceCarrier(target) &&
      (!isCsharpNullableReferenceTargetType(source) || isCsharpNullableReferenceTargetType(target)) &&
      namedTargetTypeImplicitlyAccepts(input, getCsharpNullableElementTargetType(source) ?? source,
        getCsharpNullableElementTargetType(target) ?? target, visited);
}

export function implementedConstraintType(
  input: Pick<CsharpPolicyContext, "providers" | "projectTypes">,
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef | undefined {
  if (constraint.contract?.kind !== "target-named") return undefined;
  const contract = substituteTargetTypeParameters(constraint.contract, substitutions);
  if (contract.kind !== "target-named") return undefined;
  const arguments_ = contract.typeArguments ?? [];
  const definition = input.projectTypes.catalog.definitionForId(contract.id);
  if (definition !== undefined) {
    return input.projectTypes.catalog.targetTypeForDeclaration(definition.declaration, arguments_);
  }
  const lookup = csharpNativeInheritanceLookup(contract);
  const selected = lookup.kind === "target-id"
    ? input.providers.findTargetBindingByTargetId(lookup.targetId, "ordinary")
    : input.providers.findTargetBindingByMetadataName(lookup.metadataName, "ordinary");
  const binding = csharpTargetBindingFact(csharpProviderBindingFromResolution(selected));
  return binding === undefined ? undefined : csharpTargetTypeFromBinding(binding, arguments_);
}
