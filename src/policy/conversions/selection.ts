import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import type {
  CsharpTargetBindingFact,
  CsharpTargetConversionOperatorFact,
  CsharpTargetNamedTypeRef,
  TargetConstraint,
  TargetTypeParameter,
  TargetTypeRef,
} from "../types/index.js";
import {
  csharpBaseTargetTypeFromBinding,
  csharpEnumerableTargetType,
  csharpObjectTargetType,
  csharpTargetBindingFact,
  getCsharpCollectionElementTargetType,
  getCsharpDelegateSignature,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpTaskResultTargetType,
  isCsharpAnyRuntimeCarrier,
  isCsharpNullableReferenceTargetType,
  substituteTargetTypeParameters,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../types/index.js";
import {
  sourcePrimitiveImplicitlyConverts,
} from "./source-primitives.js";
import {
  csharpLiteralIsRepresentableAs,
} from "./literals.js";

export type CsharpConversionMode = "implicit" | "explicit";

export type CsharpConversionSelection =
  | { readonly kind: "identity" }
  | {
      readonly kind: "implicit";
      readonly proof:
        | "numeric"
        | "literal"
        | "nullable"
        | "reference"
        | "collection-interface"
        | "runtime-union-arm"
        | "provider-operator";
      readonly providerOperatorId?: string;
    }
  | {
      readonly kind: "cast";
      readonly proof:
        | "numeric"
        | "nullable"
        | "reference"
        | "provider-operator";
      readonly providerOperatorId?: string;
    }
  | { readonly kind: "nullable-value" }
  | { readonly kind: "delegate-adapter" }
  | { readonly kind: "compat-box" }
  | {
      readonly kind: "compat-cast";
      readonly runtimeUnionArms?: readonly TargetTypeRef[];
    }
  | {
      readonly kind: "ambiguous";
      readonly candidateIds: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export type CsharpConversionTargetPreference =
  | "left"
  | "right"
  | "equivalent"
  | "incomparable";

export function compareCsharpImplicitConversionTargets(
  input: Pick<CsharpTranslationContext, "providers" | "target">,
  left: TargetTypeRef,
  right: TargetTypeRef,
): CsharpConversionTargetPreference {
  if (targetTypeRefEquals(left, right)) {
    return "equivalent";
  }
  const leftToRight = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, left, right, "implicit"),
  );
  const rightToLeft = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, right, left, "implicit"),
  );
  if (leftToRight === rightToLeft) {
    return leftToRight ? "equivalent" : "incomparable";
  }
  return leftToRight ? "left" : "right";
}

export function selectCsharpConversion(
  input: Pick<CsharpTranslationContext, "providers" | "target">,
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
  const anyConversion = selectAnyConversion(input, source, target);
  if (anyConversion !== undefined) {
    return anyConversion;
  }
  if (
    getCsharpTaskResultTargetType(source) !== undefined ||
    getCsharpTaskResultTargetType(target) !== undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "Task carriers cannot be unwrapped, reinterpreted, or changed in arity without an exact target conversion relation.",
    };
  }
  const runtimeUnion = selectRuntimeUnionConversion(source, target);
  if (runtimeUnion !== undefined) {
    return runtimeUnion;
  }
  const nullable = selectNullableConversion(input, source, target, mode);
  if (nullable !== undefined) {
    return nullable;
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
  const delegate = selectDelegateConversion(source, target);
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

function conversionIsImplicitlyApplicable(
  selection: CsharpConversionSelection,
): boolean {
  return selection.kind === "identity" ||
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
  const element = getCsharpCollectionElementTargetType(source);
  return element !== undefined &&
      targetTypeRefEquals(target, csharpEnumerableTargetType(element))
    ? { kind: "implicit", proof: "collection-interface" }
    : undefined;
}

export function selectCsharpExpressionConversion(
  input: Pick<CsharpTranslationContext, "ast" | "providers" | "target">,
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection {
  const selected = selectCsharpConversion(input, source, target, mode);
  return selected.kind === "rejected" &&
      target !== undefined &&
      csharpLiteralIsRepresentableAs(input, expression, target)
    ? { kind: "implicit", proof: "literal" }
    : selected;
}

function selectAnyConversion(
  input: Pick<CsharpTranslationContext, "target">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const sourceAny = isCsharpAnyRuntimeCarrier(source);
  const targetAny = isCsharpAnyRuntimeCarrier(target);
  if (!sourceAny && !targetAny) {
    return undefined;
  }
  if (readCsharpTypescriptCompatibilityMode(input.target) !== "compat") {
    return {
      kind: "rejected",
      reason:
        "C# strict-native mode cannot cross a TypeScript any boundary.",
    };
  }
  if (sourceAny && targetAny) {
    return { kind: "identity" };
  }
  if (targetAny) {
    return { kind: "compat-box" };
  }
  return {
    kind: "compat-cast",
    ...(getCsharpRuntimeUnionArms(target) === undefined
      ? {}
      : { runtimeUnionArms: getCsharpRuntimeUnionArms(target) }),
  };
}

function selectRuntimeUnionConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const arms = getCsharpRuntimeUnionArms(target);
  if (arms === undefined) {
    return undefined;
  }
  const matchingArms = arms.filter((arm) => targetTypeRefEquals(arm, source));
  if (matchingArms.length === 1) {
    return { kind: "implicit", proof: "runtime-union-arm" };
  }
  return {
    kind: "rejected",
    reason:
      matchingArms.length === 0
        ? "C# runtime-union conversion requires the source representation to match one exact union arm."
        : "C# runtime-union conversion matched more than one structurally identical union arm.",
  };
}

function selectNullableConversion(
  input: Pick<CsharpTranslationContext, "providers" | "target">,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const targetElement = getCsharpNullableElementTargetType(target);
  if (targetElement !== undefined) {
    const elementConversion = selectCsharpConversion(
      input,
      source,
      targetElement,
      "implicit",
    );
    if (
      elementConversion.kind === "identity" ||
      elementConversion.kind === "implicit"
    ) {
      return { kind: "implicit", proof: "nullable" };
    }
  }
  const sourceElement = getCsharpNullableElementTargetType(source);
  if (sourceElement !== undefined && targetTypeRefEquals(sourceElement, target)) {
    return mode === "explicit"
      ? { kind: "nullable-value" }
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

function selectDelegateConversion(
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
    targetTypeRefEquals(source.returnType, target.returnType);
}

function namedTargetTypesAreRelated(
  input: Pick<CsharpTranslationContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return namedTargetTypeImplicitlyAccepts(input, source, target, new Set()) ||
    namedTargetTypeImplicitlyAccepts(input, target, source, new Set());
}

function namedTargetTypeImplicitlyAccepts(
  input: Pick<CsharpTranslationContext, "providers">,
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
  input: Pick<CsharpTranslationContext, "providers">,
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
  input: Pick<CsharpTranslationContext, "providers">,
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

function targetBindingSubstitutions(
  binding: CsharpTargetBindingFact,
  arguments_: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  return new Map(
    (binding.typeParameters ?? []).flatMap((parameter, index) => {
      const argument = arguments_[index];
      return argument === undefined
        ? []
        : [[parameter.name, argument] as const];
    }),
  );
}

type ProviderConversionSelection =
  | { readonly kind: "none" }
  | Extract<CsharpConversionSelection, { readonly kind: "implicit" | "cast" | "ambiguous" }>;

function selectProviderConversionOperator(
  input: Pick<CsharpTranslationContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): ProviderConversionSelection {
  const matches = providerConversionCandidates(input, source, target)
    .filter((operator) =>
      operator.conversionKind === "implicit" ||
      mode === "explicit" && operator.conversionKind === "explicit");
  if (matches.length === 0) {
    return { kind: "none" };
  }
  const candidateIds = [...new Set(matches.map((operator) => operator.id))]
    .sort((left, right) => left.localeCompare(right));
  if (matches.length !== 1) {
    return {
      kind: "ambiguous",
      candidateIds,
      reason:
        "More than one exact provider conversion operator relates the selected C# source and target representations.",
    };
  }
  const operator = matches[0]!;
  return operator.conversionKind === "implicit"
    ? {
        kind: "implicit",
        proof: "provider-operator",
        providerOperatorId: operator.id,
      }
    : {
        kind: "cast",
        proof: "provider-operator",
        providerOperatorId: operator.id,
      };
}

function providerConversionCandidates(
  input: Pick<CsharpTranslationContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): readonly CsharpTargetConversionOperatorFact[] {
  return uniqueProviderBindingCandidates(input, source, target)
    .flatMap(({ binding, typeArguments }) =>
      (binding.conversionOperators ?? [])
        .map((operator) =>
          substituteConversionOperatorTypes(
            operator,
            binding,
            typeArguments,
          ))
        .filter((operator) =>
          targetTypeRefEquals(operator.sourceType, source) &&
          targetTypeRefEquals(operator.targetType, target)));
}

function uniqueProviderBindingCandidates(
  input: Pick<CsharpTranslationContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): readonly {
  readonly binding: CsharpTargetBindingFact;
  readonly typeArguments: readonly TargetTypeRef[];
}[] {
  const byId = new Map<string, {
    readonly binding: CsharpTargetBindingFact;
    readonly typeArguments: readonly TargetTypeRef[];
  }>();
  for (const type of [source, target]) {
    if (type.kind !== "target-named") {
      continue;
    }
    const binding = csharpTargetBindingFact(
      input.providers.findTargetBindingByTargetId(type.id),
    );
    if (binding === undefined) {
      continue;
    }
    const key = `${binding.id}\u0000${(type.typeArguments ?? [])
      .map(targetTypeRefKey)
      .join("\u0000")}`;
    byId.set(key, {
      binding,
      typeArguments: type.typeArguments ?? [],
    });
  }
  return [...byId.values()];
}

function substituteConversionOperatorTypes(
  operator: CsharpTargetConversionOperatorFact,
  binding: CsharpTargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): CsharpTargetConversionOperatorFact {
  const substitutions = targetBindingSubstitutions(binding, typeArguments);
  return substitutions.size === 0
    ? operator
    : {
        ...operator,
        declaringType: substituteTargetTypeParameters(
          operator.declaringType,
          substitutions,
        ),
        sourceType: substituteTargetTypeParameters(
          operator.sourceType,
          substitutions,
        ),
        targetType: substituteTargetTypeParameters(
          operator.targetType,
          substitutions,
        ),
      };
}
