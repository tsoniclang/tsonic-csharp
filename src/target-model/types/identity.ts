import type {
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./model.js";

export function isCsharpThrowableTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpThrowable === true;
}

export function isCsharpStringTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpSpecialType === "string";
}

export function isCsharpJsStringTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsStringCarrier === true;
}

export function isCsharpVoidTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpSpecialType === "void";
}

export function isCsharpValueTypeTargetType(type: TargetTypeRef): boolean {
  if (type.kind === "source-primitive" || type.kind === "pointer" || type.kind === "function-pointer" || type.kind === "tuple") {
    return true;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  const csharpType = type as CsharpTargetNamedTypeRef;
  return csharpType.csharpSpecialType === "nullable" ||
    csharpType.csharpValueType === true ||
    csharpType.csharpSourceDeclarationKind === "enum" ||
    csharpType.csharpSourceDeclarationKind === "struct";
}
