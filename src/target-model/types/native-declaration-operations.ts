import type { TargetTypeRef } from "./native-type-data.js";
import type { CsharpNativeCallableMember, CsharpTargetMember, CsharpTargetParameter, TargetConstraint } from "./model.js";
import type { CsharpNativeDeclaration, CsharpNativeDeclarationApplication, CsharpNativeDeclarationMember } from "./native-declarations.js";
import { targetTypeRefKey } from "./equality.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";
import { csharpTypeIdentityAt, snapshotCsharpTargetTypes } from "./snapshot.js";
import { substituteCsharpNativeCallableMember, substituteTargetTypeParameters } from "./substitution.js";
import { snapshotCsharpMetadata } from "../metadata/immutable.js";

export function csharpNativeCallableTargetMember(owner: TargetTypeRef, callable: CsharpNativeCallableMember,
  parameters: readonly CsharpTargetParameter[], staticMember: boolean): CsharpTargetMember {
  return Object.freeze({ id: JSON.stringify([owner.kind === "target-named" ? owner.id : targetTypeRefKey(owner), callable.name]),
    kind: "method", sourceName: callable.name, targetName: callable.name, declaringType: owner, static: staticMember,
    ...(callable.signature.receiver === undefined ? {} : { receiverPassing: "target-parameter" as const }),
    parameters: Object.freeze([...parameters]),
    returnType: callable.signature.returnType,
    ...(callable.signature.returnPassing === undefined ? {} : { csharpReturnPassing: callable.signature.returnPassing }),
    typeParameters: Object.freeze(callable.typeParameters.map(parameter => Object.freeze({ identity: parameter.identity, name: parameter.name,
      csharpAllowsRefLike: false }))) });
}

export function snapshotCsharpNativeDeclaration(definition: CsharpNativeDeclaration): CsharpNativeDeclaration {
  definition = snapshotCsharpMetadata(definition, path => nativeDeclarationIdentityAt(definition, path));
  const identities = new Set(definition.parameters.map(parameter => parameter.identity));
  const arguments_ = definition.carrier.typeArguments ?? [];
  if (definition.carrier.kind !== "target-named" || identities.size !== definition.parameters.length ||
    arguments_.length !== definition.parameters.length || definition.parameters.some((parameter, index) => {
      const argument = arguments_[index];
      return parameter.kind !== "type-parameter" || parameter.csharpConstraints?.kind !== "resolved" ||
        argument?.kind !== "type-parameter" || argument.identity !== parameter.identity;
    })) {
    throw new TypeError("A completed Native definition requires its exact ordered binders and finalized constraints.");
  }
  const members = Object.freeze(definition.members.map(member => mapDeclarationMember(member, snapshotType, snapshotCallable)));
  if (new Set(members.map(member => member.member.id)).size !== members.length) {
    throw new TypeError("A complete Native declaration retains every original physical member identity exactly once.");
  }
  for (const member of members) validateDeclarationMember(member);
  const types = [definition.carrier, ...definition.parameters, ...definition.supertypes];
  const free = new Set([...csharpFreeTypeParameterIdentities(types), ...members.flatMap(member => [...memberFreeParameters(member)])]);
  if ([...free].some(identity => !identities.has(identity))) {
    throw new TypeError("A completed Native definition requires its exact ordered binders over every member and implemented contract.");
  }
  const carrier = snapshotType(definition.carrier);
  if (carrier.kind !== "target-named") throw new TypeError("A Native definition retains its named carrier.");
  return Object.freeze({ carrier, kind: definition.kind,
    parameters: Object.freeze(definition.parameters.map(parameter => {
      const selected = snapshotType(parameter);
      if (selected.kind !== "type-parameter" || selected.csharpConstraints?.kind !== "resolved") {
        throw new TypeError("A Native definition retains its completed parameter constraints.");
      }
      return Object.freeze({ ...selected, csharpConstraints: selected.csharpConstraints });
    })),
    supertypes: Object.freeze(definition.supertypes.map(snapshotType)), members });
}

export function applyCsharpNativeDeclaration(definition: CsharpNativeDeclaration,
  carrier: TargetTypeRef): CsharpNativeDeclarationApplication | undefined {
  if (carrier.kind !== "target-named" || carrier.id !== definition.carrier.id ||
    (carrier.typeArguments?.length ?? 0) !== definition.parameters.length) return undefined;
  const arguments_ = snapshotCsharpTargetTypes(carrier.typeArguments ?? []);
  const substitutions = new Map(definition.parameters.map((parameter, index) => [parameter.identity, arguments_[index]!]));
  const unchanged = arguments_.every((argument, index) =>
    targetTypeRefKey(argument, "emission") === targetTypeRefKey(definition.parameters[index]!, "emission"));
  const physical = snapshotType(substituteTargetTypeParameters(definition.carrier, substitutions));
  if (physical.kind !== "target-named") throw new TypeError("A Native declaration application retains its named physical carrier.");
  return Object.freeze({ definition, carrier: Object.freeze(physical),
    supertypes: unchanged ? definition.supertypes : Object.freeze(definition.supertypes.map(type => snapshotType(substituteTargetTypeParameters(type, substitutions)))),
    members: unchanged ? definition.members : Object.freeze(definition.members.map(member => mapDeclarationMember(member,
      type => snapshotType(substituteTargetTypeParameters(type, substitutions)), member => snapshotCallable(substituteCsharpNativeCallableMember(member, substitutions))))) });
}

export function csharpNativeDeclarationKey(definition: CsharpNativeDeclaration): string {
  const key = (type: TargetTypeRef): string => targetTypeRefKey(type, "emission");
  const memberKey = (member: CsharpTargetMember): readonly unknown[] => [member.id, member.kind, member.targetName,
    member.static === true, member.readonly === true, member.declaringType === undefined ? null : key(member.declaringType),
    member.parameters.map(parameter => [parameter.name, key(parameter.type), parameter.passingMode, parameter.optional === true, parameter.paramsArray === true]),
    member.returnType === undefined ? null : key(member.returnType), member.csharpReturnPassing ?? null,
    member.typeParameters?.map(parameter => [parameter.identity, parameter.name, parameter.csharpAllowsRefLike,
      parameter.constraints?.map(constraint => constraint.kind === "implements" ? [constraint.kind, key(constraint.contract)] : constraint)]) ?? []];
  const callableKey = (member: CsharpNativeCallableMember): readonly unknown[] => [member.name,
    member.typeParameters.map(parameter => [parameter.identity, parameter.name, parameter.constraints.map(constraint =>
      constraint.kind === "type" ? [constraint.kind, key(constraint.type)] : constraint)]), member.signature.kind,
    member.signature.receiver === undefined ? null : [key(member.signature.receiver.type), member.signature.receiver.passingMode],
    member.signature.parameters.map(key), member.signature.parameterPassingModes, key(member.signature.returnType),
    member.signature.returnPassing ?? null, member.signature.optionalParameterIndexes ?? [], member.signature.restParameterIndex ?? null];
  return JSON.stringify([key(definition.carrier), definition.kind, definition.parameters.map(key), definition.supertypes.map(key),
    definition.members.map(member => member.kind === "slot" ? [member.kind, memberKey(member.member),
      member.storage === undefined ? null : [key(member.storage.type), member.storage.readonly],
      member.read === undefined ? null : [memberKey(member.read.member), key(member.read.type), member.read.passingMode],
      member.write === undefined ? null : [memberKey(member.write.member), key(member.write.type), member.write.passingMode]]
      : member.kind === "event" ? [member.kind, memberKey(member.member)]
      : [member.kind, memberKey(member.member), callableKey(member.method), member.value === undefined ? null : callableKey(member.value)])]);
}

function mapDeclarationMember(member: CsharpNativeDeclarationMember, type: (value: TargetTypeRef) => TargetTypeRef,
  callable: (value: CsharpNativeCallableMember) => CsharpNativeCallableMember): CsharpNativeDeclarationMember {
  const physical = mapMember(member.member, type);
  if (member.kind === "event") {
    if (physical.kind !== "event") throw new TypeError("A Native event inventory retains its actual event member.");
    return Object.freeze({ kind: member.kind, member: physical });
  }
  if (member.kind === "callable") {
    if (physical.kind !== "method" && physical.kind !== "constructor" && physical.kind !== "operator") {
      throw new TypeError("A Native callable inventory requires its actual method, constructor or operator.");
    }
    return Object.freeze({ kind: member.kind, member: physical, method: callable(member.method),
      value: member.value === undefined ? undefined : callable(member.value) });
  }
  if (physical.kind !== "field" && physical.kind !== "property" && physical.kind !== "indexer" ||
    physical.kind !== "field" && member.storage !== undefined || member.storage === undefined && member.read === undefined && member.write === undefined) {
    throw new TypeError("A Native slot retains actual field storage or the complete present read/write accessor inventory.");
  }
  return Object.freeze({ kind: member.kind, member: physical,
    storage: member.storage === undefined ? undefined : Object.freeze({ type: type(member.storage.type), readonly: member.storage.readonly }),
    read: member.read === undefined ? undefined : Object.freeze({ member: mapMember(member.read.member, type),
      type: type(member.read.type), passingMode: member.read.passingMode }),
    write: member.write === undefined ? undefined : Object.freeze({ member: mapMember(member.write.member, type),
      type: type(member.write.type), passingMode: member.write.passingMode }) });
}

function mapMember(member: CsharpTargetMember, type: (value: TargetTypeRef) => TargetTypeRef): CsharpTargetMember {
  return Object.freeze({ ...member,
    ...(member.declaringType === undefined ? {} : { declaringType: type(member.declaringType) }),
    parameters: Object.freeze(member.parameters.map(parameter => Object.freeze({ ...parameter, type: type(parameter.type),
      ...(parameter.csharpSourceArgumentAdapter === undefined ? {} : { csharpSourceArgumentAdapter: Object.freeze({
        ...parameter.csharpSourceArgumentAdapter, sourceCallableType: type(parameter.csharpSourceArgumentAdapter.sourceCallableType) }) }) }))),
    ...(member.returnType === undefined ? {} : { returnType: type(member.returnType) }),
    ...(member.typeParameters === undefined ? {} : { typeParameters: Object.freeze(member.typeParameters.map(parameter => Object.freeze({ ...parameter,
      ...(parameter.constraints === undefined ? {} : { constraints: Object.freeze(parameter.constraints.map(constraint => mapConstraint(constraint, type))) }) }))) }) });
}

function mapConstraint(constraint: TargetConstraint, type: (value: TargetTypeRef) => TargetTypeRef): TargetConstraint {
  if (constraint.kind !== "implements") return Object.freeze({ ...constraint });
  const contract = type(constraint.contract);
  if (contract.kind !== "target-named") throw new TypeError("A substituted Native interface constraint retains its named physical contract.");
  return Object.freeze({ kind: constraint.kind, contract });
}

function snapshotType(type: TargetTypeRef): TargetTypeRef {
  return snapshotCsharpTargetTypes([type])[0]!;
}

function nativeDeclarationIdentityAt(definition: CsharpNativeDeclaration, path: readonly (string | number)[]): boolean {
  if (path.length === 6 && path[0] === "members" && typeof path[1] === "number" &&
    (path[2] === "method" || path[2] === "value") && path[3] === "typeParameters" &&
    typeof path[4] === "number" && path[5] === "declaration") return true;
  let value: unknown = definition;
  for (let index = 0; index < path.length && typeof value === "object" && value !== null; index += 1) {
    const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value;
    if (typeof kind === "string" && ["target-named", "type-parameter", "array", "tuple", "pointer", "function-pointer"].includes(kind) &&
      csharpTypeIdentityAt([0, ...path.slice(index)])) return true;
    value = Object.getOwnPropertyDescriptor(value, path[index]!)?.value;
  }
  return false;
}

function snapshotCallable(member: CsharpNativeCallableMember): CsharpNativeCallableMember {
  const signature = member.signature;
  const modes = new Set(["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]);
  if (member.name.length === 0 || new Set(member.typeParameters.map(parameter => parameter.identity)).size !== member.typeParameters.length ||
    member.typeParameters.some(parameter => parameter.identity.length === 0 || parameter.name.length === 0 ||
      Object.prototype.hasOwnProperty.call(parameter, "declaration") && (typeof parameter.declaration !== "object" || parameter.declaration === null)) ||
    signature.kind !== "call" && signature.kind !== "construct" ||
    signature.parameters.length !== signature.parameterPassingModes.length || signature.parameterPassingModes.some(mode => !modes.has(mode)) ||
    signature.receiver !== undefined && !modes.has(signature.receiver.passingMode) ||
    signature.returnPassing !== undefined && signature.returnPassing !== "byref-readonly" && signature.returnPassing !== "byref-readwrite" ||
    new Set(signature.optionalParameterIndexes ?? []).size !== (signature.optionalParameterIndexes?.length ?? 0) ||
    signature.optionalParameterIndexes?.some(index => !Number.isSafeInteger(index) || index < 0 || index >= signature.parameters.length) ||
    signature.restParameterIndex !== undefined && (!Number.isSafeInteger(signature.restParameterIndex) ||
      signature.restParameterIndex < 0 || signature.restParameterIndex !== signature.parameters.length - 1)) {
    throw new TypeError("A Native callable retains its complete exact binder, passing, optional and rest vectors.");
  }
  for (const parameter of member.typeParameters) snapshotType({ kind: "type-parameter", identity: parameter.identity, name: parameter.name,
    ...(parameter.declaration === undefined ? {} : { csharpDeclaration: parameter.declaration }),
    csharpConstraints: { kind: "resolved", constraints: parameter.constraints } });
  return Object.freeze({ name: member.name,
    typeParameters: Object.freeze(member.typeParameters.map(parameter => Object.freeze({ ...parameter,
      constraints: Object.freeze(parameter.constraints.map(constraint => constraint.kind !== "type" ? Object.freeze({ ...constraint })
        : Object.freeze({ kind: constraint.kind, type: snapshotType(constraint.type) }))) }))),
    signature: Object.freeze({ ...member.signature,
      ...(member.signature.receiver === undefined ? {} : { receiver: Object.freeze({ ...member.signature.receiver,
        type: snapshotType(member.signature.receiver.type) }) }),
      parameters: Object.freeze(member.signature.parameters.map(snapshotType)),
      parameterPassingModes: Object.freeze([...member.signature.parameterPassingModes]),
      returnType: snapshotType(member.signature.returnType),
      ...(member.signature.optionalParameterIndexes === undefined ? {} : { optionalParameterIndexes: Object.freeze([...member.signature.optionalParameterIndexes]) }) }) });
}

function validateDeclarationMember(entry: CsharpNativeDeclarationMember): void {
  const member = entry.member;
  const equal = (left: TargetTypeRef | undefined, right: TargetTypeRef | undefined): boolean => left !== undefined && right !== undefined &&
    targetTypeRefKey(left, "emission") === targetTypeRefKey(right, "emission");
  if (member.id.length === 0 || member.targetName.length === 0) throw new TypeError("A Native declaration retains original physical member identities and names.");
  if (entry.kind === "event") return;
  if (entry.kind === "slot") {
    if (entry.storage !== undefined && (!equal(entry.storage.type, member.returnType) ||
      entry.storage.readonly !== (member.readonly === true) || entry.storage.readonly && entry.write !== undefined ||
      entry.read !== undefined && !equal(entry.storage.type, entry.read.type) ||
      entry.write !== undefined && !equal(entry.storage.type, entry.write.type))) {
      throw new TypeError("A Native field retains its actual physical storage type and readonly access.");
    }
    if (entry.read !== undefined && (!equal(entry.read.type, entry.read.member.returnType) ||
      entry.read.passingMode !== (entry.read.member.csharpReturnPassing ?? "by-value"))) {
      throw new TypeError("A Native read accessor retains its exact physical result and passing mode.");
    }
    if (entry.write !== undefined) {
      const parameter = entry.write.member.kind === "method" ? entry.write.member.parameters.at(-1) : undefined;
      const type = parameter?.type ?? entry.write.member.returnType;
      if (!equal(entry.write.type, type) || entry.write.passingMode !== (parameter?.passingMode ?? "by-value")) {
        throw new TypeError("A Native write accessor retains its exact physical input and passing mode.");
      }
    }
    return;
  }
  const signature = entry.method.signature;
  const receiverOffset = member.receiverPassing === "target-parameter" ? 1 : 0;
  const parameters = member.parameters.slice(receiverOffset);
  const optional = new Set(signature.optionalParameterIndexes ?? []);
  if (member.targetName !== entry.method.name ||
    receiverOffset === 1 && (signature.receiver === undefined || !equal(member.parameters[0]?.type, signature.receiver.type) ||
      member.parameters[0]?.passingMode !== signature.receiver.passingMode) ||
    receiverOffset === 0 && signature.receiver !== undefined && (!equal(member.declaringType, signature.receiver.type) || member.static === true) ||
    parameters.length !== signature.parameters.length || parameters.some((parameter, index) => !equal(parameter.type, signature.parameters[index]) ||
      parameter.passingMode !== signature.parameterPassingModes[index] || (parameter.optional === true) !== optional.has(index) ||
      (parameter.paramsArray === true) !== (signature.restParameterIndex === index)) ||
    !equal(member.returnType, signature.returnType) || member.csharpReturnPassing !== signature.returnPassing ||
    (member.typeParameters?.length ?? 0) !== entry.method.typeParameters.length || entry.method.typeParameters.some((parameter, index) =>
      parameter.identity !== member.typeParameters?.[index]?.identity || parameter.name !== member.typeParameters?.[index]?.name)) {
    throw new TypeError("A Native callable declaration retains the supplied physical method and its complete exact ABI vector.");
  }
}

function memberFreeParameters(member: CsharpNativeDeclarationMember): ReadonlySet<string> {
  const free = new Set<string>();
  const physical = (member: CsharpTargetMember): void => {
    const bound = new Set(member.typeParameters?.map(parameter => parameter.identity) ?? []);
    const types = [member.declaringType, member.returnType, ...member.parameters.map(parameter => parameter.type),
      ...member.typeParameters?.flatMap(parameter => parameter.constraints?.flatMap(constraint => constraint.kind === "implements" ? [constraint.contract] : []) ?? []) ?? []]
      .filter((type): type is TargetTypeRef => type !== undefined);
    for (const identity of csharpFreeTypeParameterIdentities(types)) if (!bound.has(identity)) free.add(identity);
  };
  physical(member.member);
  if (member.kind === "slot") {
    for (const access of [member.read, member.write]) if (access !== undefined) physical(access.member);
    for (const identity of csharpFreeTypeParameterIdentities([member.storage?.type, member.read?.type, member.write?.type]
      .filter((type): type is TargetTypeRef => type !== undefined))) free.add(identity);
  } else if (member.kind === "callable") for (const callable of [member.method, ...member.value === undefined ? [] : [member.value]]) {
    const bound = new Set(callable.typeParameters.map(parameter => parameter.identity));
    const constraints = callable.typeParameters.flatMap(parameter => parameter.constraints.flatMap(constraint => constraint.kind === "type" ? [constraint.type] : []));
    const types = [...callable.signature.parameters, callable.signature.returnType, ...constraints,
      ...callable.signature.receiver === undefined ? [] : [callable.signature.receiver.type]];
    for (const identity of csharpFreeTypeParameterIdentities(types)) if (!bound.has(identity)) free.add(identity);
  }
  return free;
}
