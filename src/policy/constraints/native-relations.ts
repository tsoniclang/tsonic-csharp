import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import { csharpBaseTargetTypeFromBinding, csharpTargetTypeFromBinding } from "../types/storage/bindings.js";
import { csharpObjectTargetType, csharpTargetBindingFact, getCsharpDelegateSignature, getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, isCsharpNullableReferenceTargetType, isCsharpReferenceCarrier, isCsharpSourceDelegateTargetType, isCsharpValueTypeTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/index.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { targetBindingSubstitutions } from "../conversions/provider-operators.js";
import type { CsharpTargetBindingFact, CsharpTargetNamedTypeRef, TargetConstraint, TargetTypeParameter, TargetTypeRef } from "../types/index.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpConversionShapeQueries } from "../conversions/shape-queries.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import { csharpSourcePrimitiveDotnetMetadataName } from "../../target-model/types/carriers/scalar-types.js";

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
