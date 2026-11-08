import type { CsharpTypeParameterConstraint, TargetTypeRef } from "./native-type-data.js";
import type { CsharpDelegateSignatureShape, CsharpNativeCallableMember, CsharpTargetNamedTypeRef } from "./model.js";
import { csharpTargetTypeComponents } from "./components.js";
import { csharpOptionalStorageDefinitionNames } from "./native-generics.js";

export function targetTypeRefEquals(left: TargetTypeRef, right: TargetTypeRef): boolean {
  return left === right || targetTypeRefKey(left) === targetTypeRefKey(right);
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

const noBoundTypeParameters: ReadonlyMap<string, number> = new Map();

export function targetTypeRefKey(type: TargetTypeRef, purpose: "physical" | "emission" = "physical"): string {
  return scopedTargetTypeRefKey(type, noBoundTypeParameters, purpose);
}

export function scopedTargetTypeRefKey(type: TargetTypeRef, boundParameters: ReadonlyMap<string, number>,
  purpose: "physical" | "emission" = "physical"): string {
  const encoded = new Map<TargetTypeRef, number>();
  const active = new Set<TargetTypeRef>();
  const positions = new Map<string, number>();
  const entries: (readonly unknown[])[] = [];
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
    const key = JSON.stringify(entry);
    let position = positions.get(key);
    if (position === undefined) {
      position = entries.length;
      entries.push(entry);
      positions.set(key, position);
    }
    encoded.set(frame.type, position);
    active.delete(frame.type);
    pending.pop();
  }
  return JSON.stringify([positionOf(type), entries]);

  function enter(value: TargetTypeRef): void {
    active.add(value);
    pending.push({ type: value, children: purpose === "physical" ? physicalChildren(value) : csharpTargetTypeComponents(value), index: 0 });
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
        return [value.kind, nullable, value.rank ?? 1, positionOf(value.element)];
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
