import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef, TargetBindingFact } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../target-model/types/generic-constraints.js";

export interface CsharpGeneratedTypeDefinition {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly kind: TargetBindingFact["kind"];
  readonly parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly supertypes: readonly TargetTypeRef[];
}

export interface CsharpTypeDefinitionRegistry extends CsharpTypeDefinitions {
  retainGenerated(definition: CsharpGeneratedTypeDefinition): CsharpGeneratedTypeDefinition;
  seal(): CsharpTypeDefinitions;
}

export function createCsharpTypeDefinitionRegistry(
  nativeBinding: (id: string) => TargetBindingFact | undefined,
): CsharpTypeDefinitionRegistry {
  const kinds = new Map<string, TargetBindingFact["kind"] | undefined>();
  const generated = new Map<string, CsharpGeneratedTypeDefinition>();
  let sealed = false;
  const nativeDeclarationKind: CsharpTypeDefinitions["nativeDeclarationKind"] = carrier => {
    if (carrier.kind !== "target-named") return undefined;
    const definition = generated.get(carrier.id);
    if (definition !== undefined) return argumentsFor(definition, carrier) === undefined ? undefined : definition.kind;
    if (kinds.has(carrier.id)) return kinds.get(carrier.id);
    if (sealed) return undefined;
    if (kinds.size >= 1_048_576) failTargetAnalysisInvariant("tsonic-csharp", "The Native declaration catalog exceeds its finite resource bound.");
    const binding = nativeBinding(carrier.id);
    const kind = binding?.target === "csharp" && binding.id === carrier.id ? binding.kind : undefined;
    kinds.set(carrier.id, kind);
    return kind;
  };
  const nativeSupertypes: CsharpTypeDefinitions["nativeSupertypes"] = carrier => {
    if (carrier.kind !== "target-named") return undefined;
    const definition = generated.get(carrier.id);
    if (definition === undefined) return undefined;
    const arguments_ = argumentsFor(definition, carrier);
    if (arguments_ === undefined) return undefined;
    if (arguments_.every((argument, index) => targetTypeRefEquals(argument, definition.parameters[index]!))) {
      return definition.supertypes;
    }
    const substitutions = new Map(definition.parameters.map((parameter, index) => [parameter.identity, arguments_[index]!]));
    return Object.freeze(definition.supertypes.map(supertype => substituteTargetTypeParameters(supertype, substitutions)));
  };
  return Object.freeze({ nativeDeclarationKind, nativeSupertypes,
    retainGenerated(definition) {
      const parameters = Object.freeze([...definition.parameters]);
      const identities = new Set(parameters.map(parameter => parameter.identity));
      if (identities.size !== parameters.length ||
        definition.carrier.typeArguments?.length !== parameters.length && !(definition.carrier.typeArguments === undefined && parameters.length === 0) ||
        parameters.some((parameter, index) => parameter.kind !== "type-parameter" ||
          !targetTypeRefEquals(parameter, definition.carrier.typeArguments![index]!)) ||
        [...csharpFreeTypeParameterIdentities(definition.supertypes)].some(identity => !identities.has(identity))) {
        failTargetAnalysisInvariant("tsonic-csharp", "A generated Native definition requires its exact ordered binders and implemented physical contracts.");
      }
      const previous = generated.get(definition.carrier.id);
      if (previous !== undefined) {
        if (definitionKey(previous) !== definitionKey(definition)) failTargetAnalysisInvariant("tsonic-csharp",
          "One generated Native definition cannot publish competing binders or implemented contracts.");
        return previous;
      }
      if (sealed || kinds.get(definition.carrier.id) !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A generated Native definition must be registered before sealing or external binding discovery.");
      if (generated.size >= 1_048_576) failTargetAnalysisInvariant("tsonic-csharp", "The generated Native declaration catalog exceeds its finite resource bound.");
      const retained = Object.freeze({ carrier: definition.carrier, kind: definition.kind, parameters,
        supertypes: Object.freeze([...definition.supertypes]) });
      generated.set(retained.carrier.id, retained);
      return retained;
    },
    seal() {
    if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "The Native declaration catalog seals exactly once.");
    sealed = true;
    return Object.freeze({ nativeDeclarationKind, nativeSupertypes });
  } });
}

function argumentsFor(definition: CsharpGeneratedTypeDefinition, carrier: CsharpTargetNamedTypeRef): readonly TargetTypeRef[] | undefined {
  const arguments_ = carrier.typeArguments ?? [];
  return arguments_.length === definition.parameters.length ? arguments_ : undefined;
}

function definitionKey(definition: CsharpGeneratedTypeDefinition): string {
  return JSON.stringify([targetTypeRefKey(definition.carrier), definition.kind,
    definition.parameters.map(parameter => [targetTypeRefKey(parameter), csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints)]),
    definition.supertypes.map(supertype => targetTypeRefKey(supertype))]);
}
