import type {
  ExtensionFactSubject,
  TargetParameter,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asSemanticType,
  asTargetTypeRef as asCanonicalTargetTypeRef,
} from "../fact-subjects.js";

export function asType(subject: unknown): Type | undefined {
  return asSemanticType(subject);
}

export function asTargetParameter(subject: ExtensionFactSubject | undefined): TargetParameter | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const parameter = subject as { readonly name?: unknown; readonly type?: unknown; readonly passingMode?: unknown };
  return typeof parameter.name === "string" &&
    typeof parameter.passingMode === "string" &&
    asTargetTypeRef(parameter.type) !== undefined
    ? subject as TargetParameter
    : undefined;
}

export function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  return asCanonicalTargetTypeRef(subject);
}

export function targetTypeRefEquals(left: TargetTypeRef, right: TargetTypeRef): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefListEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListEquals(left.args, right.args) &&
        targetTypeRefEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        Object.is(left.value, right.value);
  }
}

export function stripMetadataArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}

export function sourceNameToCsharpMemberName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

export function targetTypeRefKey(type: TargetTypeRef): string {
  switch (type.kind) {
    case "source-primitive":
      return `source:${type.name}`;
    case "target-named":
      return `target:${type.id}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "type-parameter":
      return `type-param:${type.name}`;
    case "array":
      return `array:${targetTypeRefKey(type.element)}`;
    case "tuple":
      return `tuple:${type.elements.map(targetTypeRefKey).join(",")}`;
    case "pointer":
      return `pointer:${type.mutability}:${targetTypeRefKey(type.pointee)}`;
    case "function-pointer":
      return `fnptr:${type.abi ?? ""}:${type.args.map(targetTypeRefKey).join(",")}=>${targetTypeRefKey(type.result)}`;
    case "opaque":
      return `opaque:${type.id}`;
    case "associated-type":
      return `associated:${type.name}:${targetTypeRefKey(type.owner)}`;
    case "lifetime":
      return `lifetime:${type.name}`;
    case "target-specific":
      return `target-specific:${type.target}:${type.name}:${String(type.value)}`;
  }
}

export function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function targetTypeRefListEquals(left: readonly TargetTypeRef[], right: readonly TargetTypeRef[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const rightItem = right[index];
    return rightItem !== undefined && targetTypeRefEquals(item, rightItem);
  });
}
