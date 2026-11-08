import type { Node } from "@tsonic/tsts";
import type { SourceApplicationIdentity, SourceSumApplication, SourceTypeEvidence, SourceTypeParameter } from "@tsonic/target-api/source";
import type { TargetTypeRef, CsharpRepresentedTypeParameter } from "../../../target-model/types/native-type-data.js";
import type { CsharpNativeMethodTypeParameter } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationPosition, CsharpRepresentationView } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../../target-model/types/generic-constraints.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";
import { substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { sourceCategoryWitnessType } from "./representation-category.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "./representation-results.js";
import { resolveCsharpOptionalStorage } from "../../../target-model/types/optional-storage.js";

export type CsharpRepresentationRequirementRecipe =
  | { readonly kind: "parameter"; readonly original: SourceTypeParameter }
  | { readonly kind: "native-optional" }
  | { readonly kind: "value"; readonly evidence: SourceTypeEvidence; readonly position: CsharpRepresentationPosition }
  | { readonly kind: "role"; readonly evidence: SourceTypeEvidence; readonly role: SourceSumApplication["roles"][number]["role"] }
  | { readonly kind: "role-value"; readonly evidence: SourceTypeEvidence; readonly role: SourceSumApplication["roles"][number]["role"] }
  | { readonly kind: "category"; readonly evidence: SourceTypeEvidence; readonly physicalCarrier: TargetTypeRef }
  | { readonly kind: "collection-key"; readonly evidence: SourceTypeEvidence; readonly physicalCarrier: TargetTypeRef };

export interface CsharpRepresentationRequirements {
  retain(parameter: CsharpRepresentedTypeParameter, recipe: CsharpRepresentationRequirementRecipe): void;
  retainNative(parameters: readonly CsharpRepresentedTypeParameter[]): void;
  apply(parameters: readonly CsharpNativeMethodTypeParameter[], application: SourceApplicationIdentity,
    site: Node): CsharpRepresentationOutcome<readonly TargetTypeRef[]>;
}

export function createCsharpRepresentationRequirements(host: CsharpRepresentationHost,
  view: () => CsharpRepresentationView): CsharpRepresentationRequirements {
  const recipes = new Map<string, {
    readonly parameter: CsharpRepresentedTypeParameter;
    readonly recipes: CsharpRepresentationRequirementRecipe[];
  }>();

  function retain(parameter: CsharpRepresentedTypeParameter, recipe: CsharpRepresentationRequirementRecipe): void {
    if (recipe.kind !== "parameter" && recipe.kind !== "native-optional") host.source.assertEvidence(recipe.evidence);
    const previous = recipes.get(parameter.identity);
    if (previous === undefined) {
      recipes.set(parameter.identity, { parameter, recipes: [recipe] });
      return;
    }
    if (!sameParameter(previous.parameter, {
      identity: parameter.identity, name: parameter.name,
      ...(parameter.csharpDeclaration === undefined ? {} : { declaration: parameter.csharpDeclaration }),
      constraints: parameter.csharpConstraints.constraints,
    })) throw new TypeError("A Native requirement recipe cannot replace its original binder contract.");
    if (!previous.recipes.some(original => sameRecipe(original, recipe))) previous.recipes.push(recipe);
  }

  function retainNative(parameters: readonly CsharpRepresentedTypeParameter[]): void {
    for (const parameter of parameters) if (parameter.csharpProjection !== undefined) retain(parameter, { kind: "native-optional" });
  }

  function apply(parameters: readonly CsharpNativeMethodTypeParameter[], application: SourceApplicationIdentity,
    site: Node): CsharpRepresentationOutcome<readonly TargetTypeRef[]> {
    const published = sourceOutcome(host.applications.application(application.invocation));
    if (published.kind !== "represented") return published;
    if (published.value.identity !== application) throw new TypeError("Native requirements require the exact same-view Source application identity.");
    const sourceBindings = new Map<Node, SourceTypeEvidence>();
    for (const bindings of [application.classBindings, application.signatureBindings]) for (const binding of bindings) {
      host.source.typeParameter(binding.declaration);
      host.source.assertEvidence(binding.value);
      const previous = sourceBindings.get(binding.declaration);
      if (previous !== undefined && previous !== binding.value) throw new TypeError("A Source application cannot bind one original parameter twice.");
      sourceBindings.set(binding.declaration, binding.value);
    }
    const substitutions = new Map<string, TargetTypeRef>();
    const active = new Set<string>();

    function missing(identity: string): CsharpRepresentationOutcome<never> {
      return nativeRepresentationFailure(site, "CSHARP_NATIVE_REQUIREMENT_RECIPE_MISSING",
        `The original Native binder '${identity}' has no retained requirement application recipe.`);
    }

    function source(evidence: SourceTypeEvidence): CsharpRepresentationOutcome<SourceTypeEvidence> {
      const classApplied = sourceOutcome(host.source.substitute(evidence, application.classBindings));
      return classApplied.kind !== "represented" ? classApplied
        : sourceOutcome(host.source.substitute(classApplied.value, application.signatureBindings));
    }

    function physical(type: TargetTypeRef, owner: string): CsharpRepresentationOutcome<TargetTypeRef> {
      for (const identity of csharpFreeTypeParameterIdentities([type])) {
        if (identity === owner) continue;
        const result = resolve(identity);
        if (result.kind !== "represented") return result;
      }
      return represented(substituteTargetTypeParameters(type, substitutions));
    }

    function select(parameter: CsharpRepresentedTypeParameter,
      recipe: CsharpRepresentationRequirementRecipe): CsharpRepresentationOutcome<TargetTypeRef> {
      if (recipe.kind === "parameter") {
        const original = sourceBindings.get(recipe.original.declaration);
        if (original === undefined) return nativeRepresentationFailure(site, "CSHARP_NATIVE_REQUIREMENT_ARGUMENT_MISSING",
          `The Source application has no argument for original Native binder '${parameter.name}'.`);
        const value = view().represent(original, "type-argument", site);
        return value.kind !== "represented" ? value : represented(value.value.carrier);
      }
      if (recipe.kind === "native-optional") {
        if (parameter.csharpProjection === undefined) throw new TypeError("A Native optional requirement requires its retained projection.");
        const payload = physical(parameter.csharpProjection.arguments[0], parameter.identity);
        if (payload.kind !== "represented") return payload;
        return represented(resolveCsharpOptionalStorage(parameter.csharpProjection, payload.value));
      }
      const evidence = source(recipe.evidence);
      if (evidence.kind !== "represented") return evidence;
      if (recipe.kind === "value") {
        const value = view().represent(evidence.value, recipe.position, site);
        return value.kind !== "represented" ? value : represented(value.value.carrier);
      }
      if (recipe.kind === "role" || recipe.kind === "role-value") {
        const value = view().represent(evidence.value, "type-argument", site);
        if (value.kind !== "represented") return value;
        const role = value.value.kind === "direct" ? undefined
          : value.value.roles.find(candidate => candidate.source.role === recipe.role);
        if (role === undefined) return nativeRepresentationFailure(site, "CSHARP_NATIVE_REQUIREMENT_ROLE_MISSING",
          "The applied Source family has no retained original role for the Native requirement.");
        return represented(recipe.kind === "role" ? role.witnessType : role.valueType);
      }
      const carrier = physical(recipe.physicalCarrier, parameter.identity);
      if (carrier.kind !== "represented") return carrier;
      if (recipe.kind === "category") {
        const category = view().category(evidence.value, carrier.value, site);
        return category.kind !== "represented" ? category : sourceCategoryWitnessType(host, category.value, site);
      }
      const key = view().collectionKey(evidence.value, carrier.value, site);
      return key.kind !== "represented" ? key : represented(key.value.type);
    }

    function resolve(identity: string): CsharpRepresentationOutcome<TargetTypeRef> {
      const cached = substitutions.get(identity);
      if (cached !== undefined) return represented(cached);
      const entry = recipes.get(identity);
      if (entry === undefined) return missing(identity);
      if (active.has(identity)) return nativeRepresentationFailure(site, "CSHARP_NATIVE_REQUIREMENT_CYCLE",
        "The Native requirement application contains a cyclic physical dependency.");
      active.add(identity);
      try {
        let selected: TargetTypeRef | undefined;
        for (const recipe of entry.recipes) {
          const value = select(entry.parameter, recipe);
          if (value.kind !== "represented") return value;
          if (selected !== undefined && !targetTypeRefEquals(selected, value.value)) return nativeRepresentationFailure(site,
            "CSHARP_NATIVE_REQUIREMENT_APPLICATION_CONFLICT", "One original Native binder has incompatible applied physical requirements.");
          selected = value.value;
        }
        if (selected === undefined) return missing(identity);
        substitutions.set(identity, selected);
        return represented(selected);
      } finally {
        active.delete(identity);
      }
    }

    const result: TargetTypeRef[] = [];
    const seen = new Set<string>();
    for (const parameter of parameters) {
      if (seen.has(parameter.identity)) throw new TypeError("A Native application requires one ordered entry per original binder.");
      seen.add(parameter.identity);
      const entry = recipes.get(parameter.identity);
      if (entry === undefined) return missing(parameter.identity);
      if (!sameParameter(entry.parameter, parameter)) throw new TypeError("A Native application cannot replace its retained original binder contract.");
      const value = resolve(parameter.identity);
      if (value.kind !== "represented") return value;
      result.push(value.value);
    }
    return represented(Object.freeze(result));
  }

  return Object.freeze({ retain, retainNative, apply });
}

function sameParameter(original: CsharpRepresentedTypeParameter, parameter: CsharpNativeMethodTypeParameter): boolean {
  return original.identity === parameter.identity && original.name === parameter.name &&
    original.csharpDeclaration === parameter.declaration && csharpTypeParameterConstraintResolutionKey(original.csharpConstraints) ===
    csharpTypeParameterConstraintResolutionKey({ kind: "resolved", constraints: parameter.constraints });
}

function sameRecipe(left: CsharpRepresentationRequirementRecipe, right: CsharpRepresentationRequirementRecipe): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "parameter": return right.kind === "parameter" && left.original === right.original;
    case "native-optional": return true;
    case "value": return right.kind === "value" && left.evidence === right.evidence && left.position === right.position;
    case "role": case "role-value": return (right.kind === "role" || right.kind === "role-value") && left.evidence === right.evidence && left.role === right.role;
    case "category": case "collection-key": return (right.kind === "category" || right.kind === "collection-key") &&
      left.evidence === right.evidence && targetTypeRefEquals(left.physicalCarrier, right.physicalCarrier);
  }
}
