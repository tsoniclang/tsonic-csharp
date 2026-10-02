import {
  csharpBaseTargetTypeFromBinding,
} from "../../types/storage/bindings.js";
import {
  csharpVoidReturnCompletion,
  csharpTargetBindingFact,
  getCsharpDelegateSignature,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpJsValueTargetType,
  isCsharpAbsenceTargetType,
  isCsharpNullableReferenceTargetType,
  isCsharpValueTypeTargetType,
  isCsharpVoidTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import {
  substituteTargetTypeParameters,
} from "../../../target-model/types/substitution.js";
import { conversionIsImplicitlyApplicable, selectCsharpConversion } from "./core.js";
import { csharpConversionIsApplicable } from "./expression.js";
import { targetBindingSubstitutions } from "./provider-operators.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetConstraint,
  TargetTypeParameter,
  TargetTypeRef,
} from "../../types/index.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "./model.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import { csharpUnionLeaves, csharpUnionProjectionPath, selectCsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";

export function selectJsValueConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
  definitions?: import("../../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions,
): CsharpConversionSelection | undefined {
  const sourceJsValue = isCsharpJsValueTargetType(source);
  const targetJsValue = isCsharpJsValueTargetType(target);
  if (!sourceJsValue && !targetJsValue) {
    return undefined;
  }
  if (sourceJsValue && targetJsValue) {
    return { kind: "identity" };
  }
  if (targetJsValue) {
    return { kind: "js-value-box" };
  }
  return {
    kind: "js-value-cast",
    ...(getCsharpRuntimeUnionArms(target, definitions) === undefined
      ? {}
      : { runtimeUnionArms: getCsharpRuntimeUnionArms(target, definitions) }),
  };
}

export function selectRuntimeUnionConversion(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  if (mode === "explicit" && sourceElement !== undefined && getCsharpRuntimeUnionArms(sourceElement, input.typeDefinitions) !== undefined &&
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(target) ?? target, input.typeDefinitions) === undefined) {
    return selectCsharpRuntimeUnionProjection(input, source, target);
  }
  const sourceArms = getCsharpRuntimeUnionArms(source, input.typeDefinitions);
  const widening = selectCsharpUnionArmMapping(source, target, "source", input.typeDefinitions);
  if (widening !== undefined) return { kind: "union-map", coverage: "source", arms: widening };
  const narrowing = mode === "explicit" ? selectCsharpUnionArmMapping(source, target, "target", input.typeDefinitions) : undefined;
  if (narrowing !== undefined) return { kind: "union-map", coverage: "target", arms: narrowing };
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
  const targetArms = getCsharpRuntimeUnionArms(target, input.typeDefinitions);
  if (targetArms === undefined) {
    return undefined;
  }
  const matchingArms = targetArms.flatMap((armType, armIndex) =>
    targetTypeRefEquals(armType, source)
      ? [{ armIndex, armType }]
      : []
  );
  const candidates = matchingArms.length > 0 ? matchingArms : targetArms.flatMap((armType, armIndex) =>
    source.kind === "target-named" && armType.kind === "target-named" &&
    !isCsharpValueTypeTargetType(source) && !isCsharpValueTypeTargetType(armType) &&
    namedTargetTypeImplicitlyAccepts(input, source, armType, new Set()) ? [{ armIndex, armType }] : []);
  if (candidates.length === 1) {
    return {
      kind: "implicit",
      proof: "runtime-union-arm",
      ...candidates[0]!,
      sourceToArm: matchingArms.length === 1 ? { kind: "identity" } : { kind: "implicit", proof: "reference" },
    };
  }
  return {
    kind: "rejected",
    reason:
      candidates.length === 0
        ? "C# runtime-union conversion requires the source representation to match one exact union arm."
        : "C# runtime-union conversion matched more than one structurally identical union arm.",
  };
}

export function selectCsharpRuntimeUnionProjection(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef, target: TargetTypeRef,
): CsharpConversionSelection {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if (targetElement !== undefined && sourceElement === undefined) return {
    kind: "rejected", reason: "A union payload cannot retain absence that its source does not carry.",
  };
  const selected = targetElement ?? target;
  const path = csharpUnionProjectionPath(sourceElement ?? source, selected, input.typeDefinitions);
  const related = path !== undefined ? [{ path, armType: selected }]
    : (csharpUnionLeaves(sourceElement ?? source, input.typeDefinitions) ?? []).flatMap(leaf =>
      selected.kind === "target-named" && leaf.carrier.kind === "target-named" &&
      !isCsharpValueTypeTargetType(selected) && !isCsharpValueTypeTargetType(leaf.carrier) &&
      namedTargetTypeImplicitlyAccepts(input, selected, leaf.carrier, new Set())
        ? [{ path: leaf.path, armType: leaf.carrier, refinement: selected }] : []);
  return related.length === 1 ? { kind: "runtime-union-projection", ...related[0]!, retainsAbsence: targetElement !== undefined }
    : { kind: "rejected", reason: related.length === 0
      ? "Explicit C# runtime-union projection requires one exact payload or nominal refinement."
      : "Explicit C# runtime-union projection has ambiguous native payloads." };
}

export function selectNullableConversion(
  input: Pick<
    CsharpPolicyContext,
    "typeDefinitions" | "projectTypes" | "providers" | "target"
  >,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
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
      if (sourceElement === undefined) return elementConversion;
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
  >,
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const sourceSignature = getCsharpDelegateSignature(source);
  const targetSignature = getCsharpDelegateSignature(target);
  if (sourceSignature === undefined || targetSignature === undefined) {
    return undefined;
  }
  if (
    sourceSignature.parameters.length > targetSignature.parameters.length ||
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
  const returnConversion = isCsharpVoidTargetType(targetSignature.returnType) ||
    csharpVoidReturnCompletion(sourceSignature.returnType, targetSignature.returnType) === "absence"
    ? { kind: "void-return" as const } : selectCsharpConversion(
    input,
    sourceSignature.returnType,
    targetSignature.returnType,
    "implicit",
  );
  if (
    parameterConversions.some((conversion) =>
      !csharpConversionIsApplicable(conversion, "implicit")
    ) ||
    returnConversion.kind !== "void-return" && !csharpConversionIsApplicable(returnConversion, "implicit")
  ) {
    return rejectedDelegateConversion(source, target);
  }
  return {
    kind: "delegate-adapter",
    parameterConversions: Object.freeze(parameterConversions),
    returnConversion,
  };
}

function rejectedDelegateConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection {
  return {
    kind: "rejected",
    reason:
      `C# delegate conversion requires matching call shape and exact implicit parameter/return adaptations; source '${targetTypeRefKey(source)}', target '${targetTypeRefKey(target)}'.`,
  };
}

export function namedTargetTypesAreRelated(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return namedTargetTypeImplicitlyAccepts(input, source, target, new Set()) ||
    namedTargetTypeImplicitlyAccepts(input, target, source, new Set());
}

export function namedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
  visited: Set<string>,
): boolean {
  if (targetTypeRefEquals(source, target)) {
    return true;
  }
  if (source.kind !== "target-named" || target.kind !== "target-named") {
    return false;
  }
  const key = `${targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`;
  if (visited.has(key)) {
    return false;
  }
  visited.add(key);
  if (source.id === target.id) {
    return constructedNamedTargetTypeImplicitlyAccepts(
      input,
      source,
      target,
      visited,
    );
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
    input.providers.findTargetBindingByTargetId(source.id),
  );
  if (sourceBinding === undefined) {
    return false;
  }
  const substitutions = targetBindingSubstitutions(
    sourceBinding,
    source.typeArguments ?? [],
  );
  const baseType = csharpBaseTargetTypeFromBinding(
    sourceBinding,
    source.typeArguments ?? [],
  );
  if (
    baseType !== undefined &&
    namedTargetTypeImplicitlyAccepts(input, baseType, target, visited)
  ) {
    return true;
  }
  return (sourceBinding.implementedContracts ?? []).some((constraint) =>
    constraint.kind === "implements" &&
    namedTargetTypeImplicitlyAccepts(
      input,
      implementedConstraintType(constraint, substitutions),
      target,
      visited,
    ));
}

function constructedNamedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
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
  const binding = csharpTargetBindingFact(
    input.providers.findTargetBindingByTargetId(source.id),
  );
  const parameters = binding?.typeParameters ?? [];
  return sourceArguments.every((sourceArgument, index) => {
    const targetArgument = targetArguments[index];
    return targetArgument !== undefined &&
      typeArgumentImplicitlyAccepts(
        input,
        sourceArgument,
        targetArgument,
        parameters[index],
        visited,
      );
  });
}

function typeArgumentImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
  parameter: TargetTypeParameter | undefined,
  visited: Set<string>,
): boolean {
  if (targetTypeRefEquals(source, target)) {
    return true;
  }
  if (parameter?.variance === "out") {
    return namedTargetTypeImplicitlyAccepts(input, source, target, visited);
  }
  if (parameter?.variance === "in") {
    return namedTargetTypeImplicitlyAccepts(input, target, source, visited);
  }
  return false;
}

function implementedConstraintType(
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  return {
    kind: "target-named",
    id: constraint.contract,
    ...(constraint.typeArguments === undefined
      ? {}
      : {
          typeArguments: constraint.typeArguments.map((argument) =>
            substituteTargetTypeParameters(argument, substitutions)),
        }),
  };
}
