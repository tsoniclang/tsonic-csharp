import type { Node } from "@tsonic/tsts";
import type { SourceComponentSelector, SourceMemberOrigin, SourceTypeDescriptorSignature, SourceTypeEvidence, SourceTypeParameter } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationPosition, CsharpRepresentationView, CsharpRepresentedType, CsharpRepresentedSignature } from "../../../target-model/types/representation.js";
import type { CsharpRepresentedTypeParameter } from "../../../target-model/types/generic-constraints.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpObjectTargetType, csharpVoidTargetType, csharpNeverTargetType, csharpBigIntegerTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType, csharpJsSymbolTargetType } from "../../../target-model/types/carriers/js.js";
import { csharpAnyTargetType, csharpTsValueTargetType, csharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { selectedCsharpSourceProfileOwner } from "../../identities/source-types.js";
import { selectCsharpParameterListCarrier } from "../callables/parameter-list.js";
import { represented, sourceOutcome, nativeRepresentationFailure, representationRequirements } from "./representation-results.js";
import { representSourceSum } from "./representation-sums.js";
import { representSourceShape } from "./representation-shapes.js";
import { representSourceCategory } from "./representation-category.js";
import { representCsharpOptionalStorage } from "./representation-optional.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";
import { createCsharpRepresentationRequirements } from "./representation-requirements.js";
import { representCsharpSourceCollectionKey } from "../collections/source-keys.js";

export type { CsharpRepresentationHost, CsharpSourceMemberDeclaration } from "./representation-host.js";

export function createCsharpRepresentationView(host: CsharpRepresentationHost): CsharpRepresentationView {
  const results = new WeakMap<SourceTypeEvidence, Map<CsharpRepresentationPosition, CsharpRepresentedType>>();
  const active = new Set<SourceTypeEvidence>();
  const parameters = new Map<SourceTypeParameter, CsharpRepresentedTypeParameter>();
  const activeParameters = new Map<SourceTypeParameter, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
  const requirements = createCsharpRepresentationRequirements(host, () => view);
  const view: CsharpRepresentationView = Object.freeze({
    source: host.source,
    applyRequirements: requirements.apply,
    collectionKey(evidence: SourceTypeEvidence, physicalCarrier: TargetTypeRef, site: Node) {
      host.source.assertEvidence(evidence);
      const result = representCsharpSourceCollectionKey(host, view, requirements, evidence, physicalCarrier, site);
      if (result.kind === "represented") requirements.retainNative(result.value.requirements);
      return result;
    },
    represent,
    parameter,
    member(owner: SourceTypeEvidence, origin: SourceMemberOrigin, position: CsharpRepresentationPosition, site: Node) {
      host.source.assertEvidence(owner);
      const definition = sourceOutcome(host.source.definition(owner));
      if (definition.kind !== "represented") return definition;
      const selected = sourceOutcome(host.source.component(definition.value, { kind: "member", origin }));
      return selected.kind === "represented" ? represent(selected.value, position, site) : selected;
    },
    category(evidence: SourceTypeEvidence, physicalCarrier: TargetTypeRef, site: Node) {
      host.source.assertEvidence(evidence);
      const result = representSourceCategory(host, view, requirements, evidence, physicalCarrier, site, original => {
        const recursive = activeParameters.get(original);
        if (recursive !== undefined) return represented(Object.freeze({ carrier: recursive, requirements: Object.freeze([]) }));
        const selected = parameter(original, site);
        return selected.kind !== "represented" ? selected
          : represented(Object.freeze({ carrier: selected.value, requirements: Object.freeze([selected.value]) }));
      });
      if (result.kind === "represented") requirements.retainNative(result.value.requirements);
      return result;
    },
  });

  function parameter(original: SourceTypeParameter, site: Node): CsharpRepresentationOutcome<CsharpRepresentedTypeParameter> {
    if (host.source.typeParameter(original.declaration) !== original) throw new TypeError("A Native binder requires its exact Source view identity.");
    const constraint = sourceOutcome(host.source.constraint(original));
    if (constraint.kind !== "represented") return constraint;
    const defaultType = sourceOutcome(host.source.defaultType(original));
    if (defaultType.kind !== "represented") return defaultType;
    const cached = parameters.get(original);
    if (cached !== undefined) return represented(cached);
    const recursive = activeParameters.get(original);
    if (recursive !== undefined) throw new TypeError("A public Native parameter query cannot publish an unfinished constraint definition.");
    const identity = host.identity(original.declaration);
    if (identity.name === undefined || identity.name.length === 0) throw new TypeError("An original Source type parameter requires its actual authored Native binder name.");
    const shell = Object.freeze({ kind: "type-parameter" as const,
      identity: identity.identity, name: identity.name, csharpDeclaration: original.declaration });
    activeParameters.set(original, shell);
    try {
      let bound: CsharpRepresentedType | undefined;
      let defaultValue: CsharpRepresentedType | undefined;
      if (constraint.value.kind === "type") {
        const selected = represent(constraint.value.value, "type-argument", site);
        if (selected.kind !== "represented") return selected;
        bound = selected.value;
      }
      if (defaultType.value.kind === "type") {
        const selected = represent(defaultType.value.value, "type-argument", site);
        if (selected.kind !== "represented") return selected;
        defaultValue = selected.value;
      }
      const constraints = host.nativeConstraints(original, bound, defaultValue, shell, site);
      if (constraints.kind !== "represented") return constraints;
      const value: CsharpRepresentedTypeParameter = Object.freeze({ ...shell,
        csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([...constraints.value]) }) });
      parameters.set(original, value);
      requirements.retain(value, { kind: "parameter", original });
      return represented(value);
    } finally {
      activeParameters.delete(original);
    }
  }

  function represent(evidence: SourceTypeEvidence, position: CsharpRepresentationPosition,
    site: Node): CsharpRepresentationOutcome<CsharpRepresentedType> {
    host.source.assertEvidence(evidence);
    const cached = activeParameters.size === 0 ? results.get(evidence)?.get(position) : undefined;
    if (cached !== undefined) return represented(cached);
    if (active.has(evidence)) return nativeRepresentationFailure(site, "CSHARP_RECURSIVE_REPRESENTATION_UNSUPPORTED",
      "A recursive Native value requires its original declared carrier; anonymous recursive value storage cannot be expanded.");
    active.add(evidence);
    try {
      const result = evidence.sum !== undefined && (evidence.type.kind === "union" || evidence.type.kind === "optional")
        ? representSourceSum(host, view, requirements, evidence, evidence.sum, site) : representDirect(evidence, position, site);
      if (result.kind === "represented") requirements.retainNative(result.value.requirements);
      if (result.kind === "represented" && activeParameters.size === 0) {
        const byPosition = results.get(evidence) ?? new Map<CsharpRepresentationPosition, CsharpRepresentedType>();
        byPosition.set(position, result.value);
        results.set(evidence, byPosition);
      }
      return result;
    } finally {
      active.delete(evidence);
    }
  }

  function direct(evidence: SourceTypeEvidence, carrier: TargetTypeRef,
    children: readonly CsharpRepresentedType[] = []): CsharpRepresentationOutcome<CsharpRepresentedType> {
    return represented(Object.freeze({ kind: "direct", evidence, carrier,
      requirements: representationRequirements(children.map(child => child.requirements)) }));
  }

  function child(evidence: SourceTypeEvidence, selector: SourceComponentSelector,
    position: CsharpRepresentationPosition, site: Node): CsharpRepresentationOutcome<CsharpRepresentedType> {
    const selected = sourceOutcome(host.source.component(evidence, selector));
    return selected.kind === "represented" ? represent(selected.value, position, site) : selected;
  }

  function signatureValue(evidence: SourceTypeEvidence, signature: SourceTypeDescriptorSignature,
    site: Node): CsharpRepresentationOutcome<CsharpRepresentedSignature> {
    const children: CsharpRepresentedType[] = [];
    for (const [index] of signature.parameters.entries()) {
      const value = child(evidence, { kind: "parameter", signature: signature.identity, index }, "storage", site);
      if (value.kind !== "represented") return value;
      children.push(value.value);
    }
    let receiver: CsharpRepresentedType | undefined;
    if (signature.receiver !== undefined) {
      const value = child(evidence, { kind: "receiver", signature: signature.identity }, "storage", site);
      if (value.kind !== "represented") return value;
      receiver = value.value;
    }
    const completion = child(evidence, { kind: "result", signature: signature.identity }, "return", site);
    if (completion.kind !== "represented") return completion;
    const typeParameters: CsharpRepresentedTypeParameter[] = [];
    for (const declaration of signature.identity.typeParameters) {
      const original = parameter(host.source.typeParameter(declaration), site);
      if (original.kind !== "represented") return original;
      typeParameters.push(original.value);
    }
    const requirements = representationRequirements([...children.map(child => child.requirements), completion.value.requirements,
      receiver?.requirements ?? []]);
    const bound = new Set(typeParameters.map(parameter => parameter.identity));
    let changed = true;
    while (changed) {
      changed = false;
      for (const requirement of requirements) {
        if (bound.has(requirement.identity) || requirement.csharpDeclaration !== undefined) continue;
        const dependencies = csharpFreeTypeParameterIdentities([requirement]);
        if (![...bound].some(identity => dependencies.has(identity))) continue;
        bound.add(requirement.identity);
        typeParameters.push(requirement);
        changed = true;
      }
    }
    return represented(Object.freeze({ source: signature, typeParameters: Object.freeze(typeParameters), receiver,
      parameters: Object.freeze(children), result: completion.value }));
  }

  function callable(evidence: SourceTypeEvidence, signatures: readonly SourceTypeDescriptorSignature[],
    site: Node, storage: "value" | "contract"): CsharpRepresentationOutcome<CsharpRepresentedType> {
    const values: CsharpRepresentedSignature[] = [];
    const children: CsharpRepresentedType[] = [];
    for (const signature of signatures) {
      const result = signatureValue(evidence, signature, site);
      if (result.kind !== "represented") return result;
      values.push(result.value);
      children.push(...result.value.parameters, result.value.result, ...(result.value.receiver === undefined ? [] : [result.value.receiver]));
    }
    const carrier = host.callableType(Object.freeze(values), site, storage);
    if (carrier.kind !== "represented") return carrier;
    const bound = new Set(values.flatMap(value => value.typeParameters.map(parameter => parameter.identity)));
    return represented(Object.freeze({ kind: "direct", evidence, carrier: carrier.value,
      requirements: Object.freeze(representationRequirements(children.map(child => child.requirements)).filter(parameter => !bound.has(parameter.identity))) }));
  }

  function representDirect(evidence: SourceTypeEvidence, position: CsharpRepresentationPosition,
    site: Node): CsharpRepresentationOutcome<CsharpRepresentedType> {
    const descriptor = evidence.type;
    switch (descriptor.kind) {
      case "primitive": return direct(evidence, csharpSourcePrimitiveTargetType(descriptor.primitive));
      case "string": return direct(evidence, csharpStringTargetType());
      case "parameter": {
        const original = host.source.typeParameter(descriptor.declaration);
        const recursive = activeParameters.get(original);
        if (recursive !== undefined) return direct(evidence, recursive);
        const selected = parameter(original, site);
        return selected.kind === "represented" ? represented(Object.freeze({ kind: "direct", evidence,
          carrier: selected.value, requirements: Object.freeze([selected.value]) })) : selected;
      }
      case "intrinsic":
        switch (descriptor.intrinsic) {
          case "any": return direct(evidence, csharpAnyTargetType());
          case "unknown": return direct(evidence, csharpTsValueTargetType());
          case "object": return direct(evidence, csharpObjectTargetType());
          case "void": return direct(evidence, csharpVoidTargetType());
          case "never": return direct(evidence, csharpNeverTargetType());
          case "absence": return direct(evidence, csharpAbsenceTargetType());
          case "bigint": return direct(evidence, csharpBigIntegerTargetType());
          case "symbol": return direct(evidence, csharpJsSymbolTargetType());
        }
      case "array": {
        const element = child(evidence, { kind: "array-element" }, "type-argument", site);
        return element.kind !== "represented" ? element : direct(evidence,
          selectedCsharpSourceProfileOwner(host.target) === "js" ? csharpJsArrayTargetType(element.value.carrier)
            : Object.freeze({ kind: "array", element: element.value.carrier }), [element.value]);
      }
      case "optional": {
        const value = child(evidence, { kind: "optional-value" }, position, site);
        if (value.kind !== "represented") return value;
        const layout = representCsharpOptionalStorage(host, value.value.carrier, site);
        return layout.kind !== "represented" ? layout : represented(Object.freeze({ kind: "direct", evidence, carrier: layout.value.carrier,
          requirements: representationRequirements([value.value.requirements, layout.value.requirements]) }));
      }
      case "tuple": {
        const children: CsharpRepresentedType[] = [];
        const requirements = [];
        const elements: TargetTypeRef[] = [];
        const rest: number[] = [];
        for (const [index, entry] of descriptor.elements.entries()) {
          const value = child(evidence, { kind: "tuple-element", index }, "type-argument", site);
          if (value.kind !== "represented") return value;
          children.push(value.value);
          const optional = entry.kind === "optional" ? representCsharpOptionalStorage(host, value.value.carrier, site) : undefined;
          if (optional !== undefined && optional.kind !== "represented") return optional;
          elements.push(optional?.value.carrier ?? value.value.carrier);
          requirements.push(value.value.requirements, optional?.value.requirements ?? []);
          if (entry.kind === "rest") rest.push(index);
        }
        const carrier = selectCsharpParameterListCarrier(Object.freeze(elements), Object.freeze(rest),
          selectedCsharpSourceProfileOwner(host.target) === "js");
        return carrier === undefined ? nativeRepresentationFailure(site, "CSHARP_TUPLE_STORAGE_UNSUPPORTED",
          "This Source tuple requires a Native storage layout that preserves every fixed and rest element.") : represented(Object.freeze({
            kind: "direct", evidence, carrier, requirements: representationRequirements(requirements) }));
      }
      case "declared": {
        const arguments_: CsharpRepresentedType[] = [];
        for (const [index] of descriptor.typeArguments.entries()) {
          const value = child(evidence, { kind: "type-argument", declaration: descriptor.declaration, index }, "type-argument", site);
          if (value.kind !== "represented") return value;
          arguments_.push(value.value);
        }
        const native = host.declaredType(evidence, Object.freeze(arguments_), site);
        if (native.kind !== "represented") return native;
        if (native.value.kind === "present") return represented(Object.freeze({ kind: "direct", evidence,
          carrier: native.value.value.carrier,
          requirements: representationRequirements([...arguments_.map(value => value.requirements), native.value.value.requirements]) }));
        const definition = sourceOutcome(host.source.definition(evidence));
        if (definition.kind !== "represented") return definition;
        if (definition.value === evidence) return nativeRepresentationFailure(site, "CSHARP_DECLARED_CARRIER_MISSING",
          "The original Source declaration has no selected Native type binding or structural definition.");
        const selected = represent(definition.value, position, site);
        return selected.kind === "represented" ? represented(Object.freeze({ ...selected.value, evidence })) : selected;
      }
      case "projection":
      case "intersection": {
        const definition = sourceOutcome(host.source.definition(evidence));
        if (definition.kind !== "represented") return definition;
        if (definition.value === evidence) return nativeRepresentationFailure(site, "CSHARP_OPEN_PROJECTION_UNSUPPORTED",
          "The Source projection requires its original closed publication or an exact Native generic result witness.");
        const selected = represent(definition.value, position, site);
        return selected.kind === "represented" ? represented(Object.freeze({ ...selected.value, evidence })) : selected;
      }
      case "callable":
        return callable(evidence, [...descriptor.calls, ...descriptor.constructs], site, "value");
      case "shape": {
        if (descriptor.calls.length + descriptor.constructs.length === 0) return representSourceShape(host, view, evidence, site, undefined);
        const composite = descriptor.members.length !== 0 || descriptor.indexes.length !== 0;
        const selected = callable(evidence, [...descriptor.calls, ...descriptor.constructs], site, composite ? "contract" : "value");
        return selected.kind !== "represented" || !composite ? selected : representSourceShape(host, view, evidence, site, selected.value);
      }
      case "union": throw new TypeError("A Source union requires its authenticated family application before Native representation.");
    }
  }
  return view;
}
