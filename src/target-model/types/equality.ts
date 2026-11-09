import type { CsharpTypeParameterConstraint, TargetTypeRef } from "./native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "./model.js";
import type { CsharpDelegateSignatureShape, CsharpNativeCallableMember } from "./native-type-data.js";
import { csharpTargetTypeComponents } from "./components.js";
import { csharpOptionalStorageDefinitionNames } from "./native-generics.js";
import { createCsharpMetadataBudget } from "../metadata/immutable.js";

export interface CsharpNativeTypeIdentity {
  key(type: TargetTypeRef, purpose?: "physical" | "emission"): string;
  scopedKey(type: TargetTypeRef, boundParameters: ReadonlyMap<string, number>, purpose?: "physical" | "emission"): string;
  components(type: TargetTypeRef, purpose: "physical" | "emission"): readonly TargetTypeRef[];
}

export interface CsharpNativeTypeIdentityBuilder extends CsharpNativeTypeIdentity {
  seal(): CsharpNativeTypeIdentity;
}

export function targetTypeRefEquals(identity: CsharpNativeTypeIdentity, left: TargetTypeRef, right: TargetTypeRef): boolean {
  return identity.key(left) === identity.key(right);
}

export function targetTypeRefIsClosed(type: TargetTypeRef): boolean {
  const visited = new Set<TargetTypeRef>();
  const pending = [type];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    if (current.kind === "type-parameter") return false;
    visited.add(current);
    pending.push(...physicalChildren(current));
  }
  return true;
}

export function targetTypeRefKey(identity: CsharpNativeTypeIdentity, type: TargetTypeRef, purpose: "physical" | "emission" = "physical"): string {
  return identity.key(type, purpose);
}

export function scopedTargetTypeRefKey(identity: CsharpNativeTypeIdentity, type: TargetTypeRef, boundParameters: ReadonlyMap<string, number>,
  purpose: "physical" | "emission" = "physical"): string {
  return identity.scopedKey(type, boundParameters, purpose);
}

export function createCsharpNativeTypeIdentity(budget: ReturnType<typeof createCsharpMetadataBudget>): CsharpNativeTypeIdentityBuilder {
  budget.reserve(7);
  const noBoundTypeParameters: ReadonlyMap<string, number> = new Map();
  const contexts = new Map<string, WeakMap<TargetTypeRef, number>>();
  const environments = new WeakMap<ReadonlyMap<string, number>, string>();
  const physicalComponents = new WeakMap<TargetTypeRef, readonly TargetTypeRef[]>();
  const emissionComponents = new WeakMap<TargetTypeRef, readonly TargetTypeRef[]>();
  const positions = new Map<string, number>();
  let open = true;
  const view: CsharpNativeTypeIdentity = Object.freeze({
    key: (type: TargetTypeRef, purpose: "physical" | "emission" = "physical") => scopedKey(type, noBoundTypeParameters, purpose),
    scopedKey,
    components,
  });
  return Object.freeze({ ...view, seal(): CsharpNativeTypeIdentity {
    if (!open) throw new TypeError("Native type identity seals exactly once per program.");
    open = false;
    return view;
  } });

  function components(type: TargetTypeRef, purpose: "physical" | "emission"): readonly TargetTypeRef[] {
    const cache = purpose === "physical" ? physicalComponents : emissionComponents;
    const previous = cache.get(type);
    if (previous !== undefined) return previous;
    if (!open) throw new TypeError("Sealed Native identity requires already-enrolled type components.");
    budget.reserve(1);
    const selected = purpose === "physical" ? physicalChildren(type) : csharpTargetTypeComponents(type, undefined, true, budget);
    if (purpose === "physical") budget.reserve(selected.length);
    const result = Object.freeze([...selected]);
    cache.set(type, result);
    return result;
  }

  function scopedKey(type: TargetTypeRef, boundParameters: ReadonlyMap<string, number>,
  purpose: "physical" | "emission" = "physical"): string {
  let environment = environments.get(boundParameters);
  if (environment === undefined) {
    if (!open) throw new TypeError("Sealed Native identity requires its identical enrolled binder environment.");
    budget.reserve(boundParameters.size + 1);
    environment = JSON.stringify([...boundParameters].sort(([left], [right]) => left.localeCompare(right)));
    environments.set(boundParameters, environment);
  }
  const context = `${purpose}:${environment}`;
  const existing = contexts.get(context);
  if (existing === undefined) {
    if (!open) throw new TypeError("Sealed Native identity requires its already-enrolled binder environment.");
    budget.reserve(1);
  }
  const encoded = existing ?? new WeakMap<TargetTypeRef, number>();
  if (existing === undefined) contexts.set(context, encoded);
  const previous = encoded.get(type);
  if (previous !== undefined) return `${purpose}:${previous}`;
  if (!open) throw new TypeError("Sealed Native identity cannot produce a new type identity.");
  const active = new Set<TargetTypeRef>();
  const pending: { readonly type: TargetTypeRef; readonly children: readonly TargetTypeRef[]; index: number }[] = [];
  enter(type);
  while (pending.length > 0) {
    const frame = pending[pending.length - 1]!;
    if (frame.index < frame.children.length) {
      const child = frame.children[frame.index++]!;
      if (encoded.has(child)) continue;
      if (active.has(child)) throw new TypeError("Native type identity requires finite metadata with nominal recursive references.");
      enter(child);
      continue;
    }
    const physical = physicalEntry(frame.type);
    const entry = purpose === "physical" ? physical : [physical, emissionEntry(frame.type, frame.children)];
    const key = JSON.stringify([purpose, entry]);
    let position = positions.get(key);
    if (position === undefined) {
      budget.reserve(1);
      position = positions.size;
      positions.set(key, position);
    }
    encoded.set(frame.type, position);
    active.delete(frame.type);
    pending.pop();
  }
  return `${purpose}:${positionOf(type)}`;

  function enter(value: TargetTypeRef): void {
    budget.reserve(1);
    active.add(value);
    pending.push({ type: value, children: components(value, purpose), index: 0 });
  }

  function positionOf(value: TargetTypeRef): number {
    const position = encoded.get(value);
    if (position === undefined) throw new TypeError("Native type identity requires every component to be encoded before its parent.");
    return position;
  }

  function physicalEntry(value: TargetTypeRef): readonly unknown[] {
    const nullable = isCsharpNullableReferenceTargetType(value);
    switch (value.kind) {
      case "source-primitive":
        return [value.kind, nullable, value.name];
      case "target-named":
        return [value.kind, nullable, value.id, value.csharpRuntimeUnionSemantics ?? null, (value.typeArguments ?? []).map(positionOf)];
      case "type-parameter":
        return [value.kind, nullable, boundParameters.has(value.identity)
          ? ["bound", boundParameters.get(value.identity)] : ["free", value.identity]];
      case "array":
        return [value.kind, nullable, value.rank ?? null, positionOf(value.element)];
      case "tuple":
        return [value.kind, nullable, value.elements.map(positionOf)];
      case "pointer":
        return [value.kind, nullable, value.mutability ?? null, positionOf(value.pointee)];
      case "function-pointer":
        return [value.kind, nullable, value.abi ?? [], value.args.map(positionOf), positionOf(value.result)];
      case "opaque":
        return [value.kind, nullable, value.id];
    }
  }

  function emissionEntry(value: TargetTypeRef, children: readonly TargetTypeRef[]): readonly unknown[] {
    const target = value.kind === "target-named" ? value as CsharpTargetNamedTypeRef : undefined;
    const method = target?.csharpMethodValue;
    const constraints = value.kind === "type-parameter" ? value.csharpConstraints : undefined;
    return [[...new Set(children.map(positionOf))],
      target === undefined ? null : [target.csharpAllowsRefLikeTypeArguments,
        target.csharpDelegateSignature === undefined ? null : signatureEntry(target.csharpDelegateSignature),
        target.csharpCallableMembers?.map(memberEntry) ?? null],
      method === undefined ? null : [method.method, method.identity, method.typeParameters, method.allowsRefLikeTypeArguments,
        positionOf(method.owner), positionOf(method.contract)],
      value.kind === "type-parameter" ? [value.name,
        constraints === undefined ? null : constraints.kind === "resolved" ? [constraints.kind, constraintEntries(constraints.constraints)]
          : [constraints.kind, constraints.reason],
        value.csharpRequirementDependencies?.map(positionOf) ?? [],
        value.csharpProjection === undefined ? null : [value.csharpProjection.kind, value.csharpProjection.part,
          value.csharpProjection.arguments.map(positionOf), csharpOptionalStorageDefinitionNames.map(name => {
            const definition = value.csharpProjection!.definitions[name];
            return [name, positionOf(definition.carrier), definition.parameters];
          })]] : null];
  }

  function signatureEntry(signature: CsharpDelegateSignatureShape): readonly unknown[] {
    return [signature.kind, signature.receiver === undefined ? null : [positionOf(signature.receiver.type), signature.receiver.passingMode],
      signature.parameters.map(positionOf), signature.parameterPassingModes, positionOf(signature.returnType), signature.returnPassing ?? null,
      signature.optionalParameterIndexes ?? [], signature.restParameterIndex ?? null];
  }

  function memberEntry(member: CsharpNativeCallableMember): readonly unknown[] {
    return [member.name, member.typeParameters.map(parameter => [parameter.identity, parameter.name, constraintEntries(parameter.constraints)]),
      signatureEntry(member.signature)];
  }

  function constraintEntries(constraints: readonly CsharpTypeParameterConstraint[]): readonly unknown[] {
    return constraints.map(constraint => constraint.kind === "type" ? [constraint.kind, positionOf(constraint.type)]
      : constraint.kind === "keyword" ? [constraint.kind, constraint.keyword] : [constraint.kind]);
  }
}
}

function physicalChildren(type: TargetTypeRef): readonly TargetTypeRef[] {
  switch (type.kind) {
    case "target-named": return type.typeArguments ?? [];
    case "array": return [type.element];
    case "tuple": return type.elements;
    case "pointer": return [type.pointee];
    case "function-pointer": return [...type.args, type.result];
    case "source-primitive":
    case "type-parameter":
    case "opaque": return [];
  }
}

function isCsharpNullableReferenceTargetType(type: TargetTypeRef): boolean {
  return (type as { readonly csharpNullableReference?: unknown }).csharpNullableReference === true;
}
