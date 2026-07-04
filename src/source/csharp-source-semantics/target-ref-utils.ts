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
import {
  isPlainCsharpIdentifier,
} from "../../csharp-identifiers.js";
import {
  isCsharpNullableReferenceTargetType,
} from "./target-types.js";

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
  if (isCsharpNullableReferenceTargetType(left) !== isCsharpNullableReferenceTargetType(right)) {
    return false;
  }
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

export function targetTypeRefIsClosed(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return true;
    case "type-parameter":
      return false;
    case "target-named":
      return (type.typeArguments ?? []).every(targetTypeRefIsClosed);
    case "array":
      return targetTypeRefIsClosed(type.element);
    case "tuple":
      return type.elements.every(targetTypeRefIsClosed);
    case "pointer":
      return targetTypeRefIsClosed(type.pointee);
    case "function-pointer":
      return targetTypeRefIsClosed(type.result) && type.args.every(targetTypeRefIsClosed);
    case "associated-type":
      return targetTypeRefIsClosed(type.owner);
  }
}

export function targetTypeRefContainsSourcePrimitive(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
      return true;
    case "array":
      return targetTypeRefContainsSourcePrimitive(type.element);
    case "tuple":
      return type.elements.some(targetTypeRefContainsSourcePrimitive);
    case "pointer":
      return targetTypeRefContainsSourcePrimitive(type.pointee);
    case "function-pointer":
      return targetTypeRefContainsSourcePrimitive(type.result) ||
        type.args.some(targetTypeRefContainsSourcePrimitive);
    case "target-named":
      return (type.typeArguments ?? []).some(targetTypeRefContainsSourcePrimitive);
    case "associated-type":
      return targetTypeRefContainsSourcePrimitive(type.owner);
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

export function targetTypeRefContainsBroadNumericFallback(type: TargetTypeRef | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  switch (type.kind) {
    case "source-primitive":
      return type.name === "float64";
    case "array":
      return targetTypeRefContainsBroadNumericFallback(type.element);
    case "tuple":
      return type.elements.some(targetTypeRefContainsBroadNumericFallback);
    case "pointer":
      return targetTypeRefContainsBroadNumericFallback(type.pointee);
    case "function-pointer":
      return targetTypeRefContainsBroadNumericFallback(type.result) ||
        type.args.some(targetTypeRefContainsBroadNumericFallback);
    case "target-named":
      return (type.typeArguments ?? []).some(targetTypeRefContainsBroadNumericFallback);
    case "associated-type":
      return targetTypeRefContainsBroadNumericFallback(type.owner);
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

export function targetTypeRefRefinesBroadNumericFallback(candidate: TargetTypeRef, existing: TargetTypeRef): boolean {
  if (candidate.kind === "source-primitive" && existing.kind === "source-primitive") {
    return candidate.name !== "float64" && existing.name === "float64";
  }
  if (candidate.kind === "array" && existing.kind === "array" && (candidate.rank ?? 1) === (existing.rank ?? 1)) {
    return targetTypeRefRefinesBroadNumericFallback(candidate.element, existing.element);
  }
  if (candidate.kind === "tuple" && existing.kind === "tuple" && candidate.elements.length === existing.elements.length) {
    return candidate.elements.every((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined &&
        (targetTypeRefEquals(element, existingElement) || targetTypeRefRefinesBroadNumericFallback(element, existingElement));
    }) && candidate.elements.some((element, index) => {
      const existingElement = existing.elements[index];
      return existingElement !== undefined && targetTypeRefRefinesBroadNumericFallback(element, existingElement);
    });
  }
  if (candidate.kind === "target-named" && existing.kind === "target-named" && candidate.id === existing.id) {
    const candidateArguments = candidate.typeArguments ?? [];
    const existingArguments = existing.typeArguments ?? [];
    if (candidateArguments.length !== existingArguments.length) {
      return false;
    }
    return candidateArguments.every((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || targetTypeRefRefinesBroadNumericFallback(argument, existingArgument));
    }) && candidateArguments.some((argument, index) => {
      const existingArgument = existingArguments[index];
      return existingArgument !== undefined && targetTypeRefRefinesBroadNumericFallback(argument, existingArgument);
    });
  }
  if (candidate.kind === "pointer" && existing.kind === "pointer" && candidate.mutability === existing.mutability) {
    return targetTypeRefRefinesBroadNumericFallback(candidate.pointee, existing.pointee);
  }
  if (candidate.kind === "function-pointer" && existing.kind === "function-pointer" && candidate.args.length === existing.args.length) {
    const resultMatches = targetTypeRefEquals(candidate.result, existing.result) ||
      targetTypeRefRefinesBroadNumericFallback(candidate.result, existing.result);
    const argsMatch = candidate.args.every((argument, index) => {
      const existingArgument = existing.args[index];
      return existingArgument !== undefined &&
        (targetTypeRefEquals(argument, existingArgument) || targetTypeRefRefinesBroadNumericFallback(argument, existingArgument));
    });
    const anyRefined = targetTypeRefRefinesBroadNumericFallback(candidate.result, existing.result) ||
      candidate.args.some((argument, index) => {
        const existingArgument = existing.args[index];
        return existingArgument !== undefined && targetTypeRefRefinesBroadNumericFallback(argument, existingArgument);
      });
    return resultMatches && argsMatch && anyRefined;
  }
  return false;
}

export function targetMemberIsClosed(member: { readonly declaringType?: TargetTypeRef; readonly returnType?: TargetTypeRef; readonly parameters: readonly TargetParameter[] }): boolean {
  return (member.declaringType === undefined || targetTypeRefIsClosed(member.declaringType)) &&
    (member.returnType === undefined || targetTypeRefIsClosed(member.returnType)) &&
    member.parameters.every((parameter) => targetTypeRefIsClosed(parameter.type));
}

export function generatedObjectShapeMemberName(sourceName: string): string {
  return isPlainCsharpIdentifier(sourceName)
    ? sourceName
    : `__tsonic_member_${hashString(sourceName)}`;
}

export function targetTypeRefKey(type: TargetTypeRef): string {
  const nullablePrefix = isCsharpNullableReferenceTargetType(type) ? "nullable-reference:" : "";
  switch (type.kind) {
    case "source-primitive":
      return `${nullablePrefix}source:${type.name}`;
    case "target-named":
      return `${nullablePrefix}target:${type.id}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "type-parameter":
      return `${nullablePrefix}type-param:${type.name}`;
    case "array":
      return `${nullablePrefix}array:${targetTypeRefKey(type.element)}`;
    case "tuple":
      return `${nullablePrefix}tuple:${type.elements.map(targetTypeRefKey).join(",")}`;
    case "pointer":
      return `${nullablePrefix}pointer:${type.mutability}:${targetTypeRefKey(type.pointee)}`;
    case "function-pointer":
      return `${nullablePrefix}fnptr:${type.abi ?? ""}:${type.args.map(targetTypeRefKey).join(",")}=>${targetTypeRefKey(type.result)}`;
    case "opaque":
      return `${nullablePrefix}opaque:${type.id}`;
    case "associated-type":
      return `${nullablePrefix}associated:${type.name}:${targetTypeRefKey(type.owner)}`;
    case "lifetime":
      return `${nullablePrefix}lifetime:${type.name}`;
    case "target-specific":
      return `${nullablePrefix}target-specific:${type.target}:${type.name}:${String(type.value)}`;
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
