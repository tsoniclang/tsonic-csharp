import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../csharp-facts.js";
import {
  csharpTargetConversionOperatorOperation,
  targetOperation,
} from "./operations.js";
import {
  type CsharpTargetNamedTypeRef,
  type CsharpTargetBindingFact,
  type CsharpTargetConversionOperatorFact,
  csharpTargetBindingFact,
  substituteTargetTypeParameters,
} from "./target-types.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";

export interface CsharpProviderConversionOperatorHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
}

export type CsharpProviderConversionOperatorMode = "implicit-only" | "explicit-or-implicit";

export type CsharpProviderConversionOperatorResult =
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly candidateIds: readonly string[] }
  | {
      readonly kind: "matched";
      readonly operation: NonNullable<ReturnType<typeof targetOperation>>;
      readonly csharpOperation: CsharpTargetOperationFact;
      readonly operator: CsharpTargetConversionOperatorFact;
    };

export function requiresCsharpProviderConversionEvidence(
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  host: CsharpProviderConversionOperatorHost,
): boolean {
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return false;
  }
  return isCsharpProviderOwnedTargetType(source, host) || isCsharpProviderOwnedTargetType(target, host);
}

export function getCsharpProviderConversionOperatorById(
  selectedOperatorId: string,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  host: CsharpProviderConversionOperatorHost,
  mode: CsharpProviderConversionOperatorMode,
): CsharpProviderConversionOperatorResult {
  if (source === undefined || targetTypeRefEquals(source, target)) {
    return { kind: "none" };
  }
  const matches = providerConversionCandidates(source, target, host)
    .filter((member) => member.id === selectedOperatorId)
    .filter((member) => isAllowedConversionOperator(member, mode));
  if (matches.length === 0) {
    return { kind: "none" };
  }
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      candidateIds: matches.map((member) => member.id),
    };
  }
  const member = matches[0]!;
  return {
    kind: "matched",
    operation: targetOperation(member.id, "operator", member.conversionKind),
    csharpOperation: csharpTargetConversionOperatorOperation(
      member.id,
      member.conversionKind,
      member.declaringType,
      member.sourceType,
      member.targetType,
    ),
    operator: member,
  };
}

function providerConversionCandidates(
  source: TargetTypeRef,
  target: TargetTypeRef,
  host: CsharpProviderConversionOperatorHost,
): readonly CsharpTargetConversionOperatorFact[] {
  return providerCandidateBindings(source, target, host)
    .flatMap(({ binding, typeArguments }) => (binding.conversionOperators ?? [])
      .map((operator) => substituteConversionOperatorTypes(operator, binding, typeArguments))
      .filter((operator) => isConversionOperatorForTypes(operator, source, target)));
}

function providerCandidateBindings(
  source: TargetTypeRef,
  target: TargetTypeRef,
  host: CsharpProviderConversionOperatorHost,
): readonly { readonly binding: CsharpTargetBindingFact; readonly typeArguments: readonly TargetTypeRef[] }[] {
  return uniqueBindingCandidates([
    providerBindingForType(source, host),
    providerBindingForType(target, host),
  ]);
}

function providerBindingForType(
  type: TargetTypeRef | undefined,
  host: CsharpProviderConversionOperatorHost,
): { readonly binding: CsharpTargetBindingFact; readonly typeArguments: readonly TargetTypeRef[] } | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const binding = csharpTargetBindingFact(host.getCsharpTargetBindingByTargetId(type.id));
  return binding === undefined
    ? undefined
    : {
        binding,
        typeArguments: type.typeArguments ?? [],
      };
}

function uniqueBindingCandidates(
  candidates: readonly ({ readonly binding: CsharpTargetBindingFact; readonly typeArguments: readonly TargetTypeRef[] } | undefined)[],
): readonly { readonly binding: CsharpTargetBindingFact; readonly typeArguments: readonly TargetTypeRef[] }[] {
  const byKey = new Map<string, { readonly binding: CsharpTargetBindingFact; readonly typeArguments: readonly TargetTypeRef[] }>();
  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }
    byKey.set(`${candidate.binding.target}:${candidate.binding.id}:${candidate.typeArguments.length}`, candidate);
  }
  return [...byKey.values()];
}

function substituteConversionOperatorTypes(
  operator: CsharpTargetConversionOperatorFact,
  binding: CsharpTargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): CsharpTargetConversionOperatorFact {
  const substitutions = new Map<string, TargetTypeRef>();
  for (let index = 0; index < (binding.typeParameters ?? []).length; index += 1) {
    const parameter = binding.typeParameters?.[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  if (substitutions.size === 0) {
    return operator;
  }
  return {
    ...operator,
    declaringType: substituteTargetTypeParameters(operator.declaringType, substitutions),
    sourceType: substituteTargetTypeParameters(operator.sourceType, substitutions),
    targetType: substituteTargetTypeParameters(operator.targetType, substitutions),
  };
}

function isConversionOperatorForTypes(
  operator: CsharpTargetConversionOperatorFact,
  source: TargetTypeRef,
  target: TargetTypeRef,
): boolean {
  return targetTypeRefEquals(operator.sourceType, source) &&
    targetTypeRefEquals(operator.targetType, target);
}

function isAllowedConversionOperator(
  operator: CsharpTargetConversionOperatorFact,
  mode: CsharpProviderConversionOperatorMode,
): boolean {
  if (operator.conversionKind === "implicit") {
    return true;
  }
  return mode === "explicit-or-implicit" && operator.conversionKind === "explicit";
}

export function isCsharpProviderOwnedTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpProviderConversionOperatorHost,
): boolean {
  if (type?.kind !== "target-named") {
    return false;
  }
  if ((type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== undefined) {
    return false;
  }
  return host.getCsharpTargetBindingByTargetId(type.id) !== undefined;
}
