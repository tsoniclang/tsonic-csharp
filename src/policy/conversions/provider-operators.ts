import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import { csharpTargetBindingFact, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/index.js";
import { substituteTargetTypeParameters } from "../types/resolution/substitution.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpTargetBindingFact, CsharpTargetConversionOperatorFact, TargetTypeRef } from "../types/index.js";

export function targetBindingSubstitutions(
  binding: CsharpTargetBindingFact,
  arguments_: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  return new Map(
    (binding.typeParameters ?? []).flatMap((parameter, index) => {
      const argument = arguments_[index];
      return argument === undefined
        ? []
        : [[parameter.identity, argument] as const];
    }),
  );
}

type ProviderConversionSelection =
  | { readonly kind: "none" }
  | Extract<CsharpConversionSelection, { readonly kind: "implicit" | "cast" | "ambiguous" }>;

export function selectProviderConversionOperator(
  input: Pick<CsharpPolicyContext, "providers">,
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
  input: Pick<CsharpPolicyContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): readonly CsharpTargetConversionOperatorFact[] {
  const selected = providerConversionInputs(input, source, target);
  return selected.bindings
    .flatMap(({ binding, typeArguments }) =>
      (binding.conversionOperators ?? [])
        .map((operator) =>
          substituteConversionOperatorTypes(
            operator,
            binding,
            typeArguments,
          ))
        .filter((operator) =>
          targetTypeRefEquals(operator.sourceType, selected.source) &&
          targetTypeRefEquals(operator.targetType, selected.target)));
}

function providerConversionInputs(
  input: Pick<CsharpPolicyContext, "providers">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly bindings: readonly {
    readonly binding: CsharpTargetBindingFact;
    readonly typeArguments: readonly TargetTypeRef[];
  }[];
} {
  const byId = new Map<string, {
    readonly binding: CsharpTargetBindingFact;
    readonly typeArguments: readonly TargetTypeRef[];
  }>();
  let selectedSource = source;
  let selectedTarget = target;
  for (const type of [source, target]) {
    if (type.kind !== "target-named") {
      continue;
    }
    const lookup = csharpNativeInheritanceLookup(type);
    const binding = csharpTargetBindingFact(csharpProviderBindingFromResolution(lookup.kind === "metadata-name"
      ? input.providers.findTargetBindingByMetadataName(lookup.metadataName, "ordinary")
      : input.providers.findTargetBindingByTargetId(lookup.targetId, "ordinary")));
    if (binding === undefined) {
      continue;
    }
    if (lookup.kind === "metadata-name") {
      if (binding.csharpType === undefined) continue;
      const physical = substituteTargetTypeParameters(binding.csharpType,
        targetBindingSubstitutions(binding, type.typeArguments ?? []));
      if (type === source) selectedSource = physical;
      if (type === target) selectedTarget = physical;
    }
    const key = `${binding.id}\u0000${(type.typeArguments ?? [])
      .map(targetTypeRefKey)
      .join("\u0000")}`;
    byId.set(key, {
      binding,
      typeArguments: type.typeArguments ?? [],
    });
  }
  return { source: selectedSource, target: selectedTarget, bindings: [...byId.values()] };
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
