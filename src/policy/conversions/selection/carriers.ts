import {
  csharpBaseTargetTypeFromBinding,
  csharpTargetBindingFact,
  getCsharpDelegateSignature,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpJsValueTargetType,
  isCsharpNullableReferenceTargetType,
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
  substituteTargetTypeParameters,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../types/index.js";
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
import type { CsharpPolicyContext } from "../../context.js";

export function selectJsValueConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
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
    ...(getCsharpRuntimeUnionArms(target) === undefined
      ? {}
      : { runtimeUnionArms: getCsharpRuntimeUnionArms(target) }),
  };
}

export function selectRuntimeUnionConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const sourceArms = getCsharpRuntimeUnionArms(source);
  if (sourceArms !== undefined && mode === "explicit") {
    const matchingArms = sourceArms.flatMap((armType, armIndex) =>
      targetTypeRefEquals(armType, target)
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
          ? "Explicit C# runtime-union projection requires the target representation to match one exact union arm."
          : "Explicit C# runtime-union projection matched more than one structurally identical union arm.",
    };
  }
  const targetArms = getCsharpRuntimeUnionArms(target);
  if (targetArms === undefined) {
    return undefined;
  }
  const matchingArms = targetArms.flatMap((armType, armIndex) =>
    targetTypeRefEquals(armType, source)
      ? [{ armIndex, armType }]
      : []
  );
  if (matchingArms.length === 1) {
    return {
      kind: "implicit",
      proof: "runtime-union-arm",
      ...matchingArms[0]!,
      sourceToArm: { kind: "identity" },
    };
  }
  return {
    kind: "rejected",
    reason:
      matchingArms.length === 0
        ? "C# runtime-union conversion requires the source representation to match one exact union arm."
        : "C# runtime-union conversion matched more than one structurally identical union arm.",
  };
}

export function selectNullableConversion(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if (targetElement !== undefined) {
    if (
      isCsharpRuntimeNullTargetType(source) ||
      isCsharpRuntimeUndefinedTargetType(source)
    ) {
      return { kind: "implicit", proof: "nullable" };
    }
    const elementConversion = selectCsharpConversion(
      input,
      sourceElement ?? source,
      targetElement,
      mode,
    );
    if (conversionIsImplicitlyApplicable(elementConversion)) {
      return { kind: "implicit", proof: "nullable" };
    }
    if (mode === "explicit" && csharpConversionIsApplicable(elementConversion, mode)) {
      return { kind: "cast", proof: "nullable" };
    }
  }
  if (sourceElement !== undefined && targetTypeRefEquals(sourceElement, target)) {
    return mode === "explicit"
      ? isCsharpNullableReferenceTargetType(source)
        ? { kind: "implicit", proof: "nullable" }
        : { kind: "nullable-value" }
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
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const sourceSignature = getCsharpDelegateSignature(source);
  const targetSignature = getCsharpDelegateSignature(target);
  if (sourceSignature === undefined || targetSignature === undefined) {
    return undefined;
  }
  return delegateSignaturesEqual(sourceSignature, targetSignature)
    ? { kind: "delegate-adapter" }
    : {
        kind: "rejected",
        reason:
          "C# delegate conversion requires exactly matching parameter and return representations.",
      };
}

function delegateSignaturesEqual(
  source: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
  target: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
): boolean {
  return source.parameters.length === target.parameters.length &&
    source.parameters.every((parameter, index) =>
      target.parameters[index] !== undefined &&
      targetTypeRefEquals(parameter, target.parameters[index]!)) &&
    targetTypeRefEquals(source.returnType, target.returnType) &&
    source.returnPassing === target.returnPassing &&
    numberListsEqual(
      source.optionalParameterIndexes ?? [],
      target.optionalParameterIndexes ?? [],
    ) &&
    source.restParameterIndex === target.restParameterIndex;
}

function numberListsEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function namedTargetTypesAreRelated(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return namedTargetTypeImplicitlyAccepts(input, source, target, new Set()) ||
    namedTargetTypeImplicitlyAccepts(input, target, source, new Set());
}

export function namedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers">,
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
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers">,
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
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers">,
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
