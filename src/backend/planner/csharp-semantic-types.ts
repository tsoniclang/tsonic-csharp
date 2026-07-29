import type {
  CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";

import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { getTargetTypeRefForType } from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  tryCsharpIdentifier,
} from "./identifiers.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../policy/types/index.js";

export function getCsharpTypeFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  seen: ReadonlySet<Type> = new Set(),
): CsharpTypeNode | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.queries(sourceFile).typeShape.isAny(type) ||
    input.queries(sourceFile).typeShape.isUnknown(type)
  ) {
    return undefined;
  }
  const typeParameterName = getCsharpTypeParameterName(type, sourceFile, input);
  if (typeParameterName !== undefined) {
    return { kind: "IdentifierName", name: typeParameterName };
  }
  const nextSeen = new Set(seen).add(type);
  const resolvedTargetType = getCsharpTargetTypeRefFromSemanticType(type, sourceFile, input, seen);
  const resolvedCsharpType = resolvedTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(resolvedTargetType);
  if (resolvedCsharpType !== undefined) {
    return resolvedCsharpType;
  }
  const directTargetType = getTargetTypeRefForType(input, type, sourceFile);
  const directCsharpType = directTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(directTargetType);
  if (directCsharpType !== undefined) {
    return directCsharpType;
  }
  const intrinsicType = getCsharpIntrinsicTypeFromSemanticType(type, sourceFile, input);
  if (intrinsicType !== undefined) {
    return intrinsicType;
  }
  void nextSeen;
  return undefined;
}

function getCsharpIntrinsicTypeFromSemanticType(
  type: Type,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): CsharpTypeNode | undefined {
  const typeShape = input.queries(sourceFile).typeShape;
  const targetType = typeShape.isBooleanLike(type)
    ? csharpSourcePrimitiveTargetType("bool")
    : typeShape.isNumberLike(type)
      ? csharpSourcePrimitiveTargetType("float64")
      : typeShape.isStringLike(type)
        ? csharpStringTargetType()
        : typeShape.isBigIntLike(type)
          ? csharpBigIntegerTargetType()
          : typeShape.isVoidLike(type)
            ? csharpVoidTargetType()
            : undefined;
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function getCsharpTargetTypeRefFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.queries(sourceFile).typeShape.isAny(type) ||
    input.queries(sourceFile).typeShape.isUnknown(type)
  ) {
    return undefined;
  }
  const typeParameterName = getCsharpTypeParameterName(type, sourceFile, input);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  const nextSeen = new Set(seen).add(type);
  const directTargetType = getTargetTypeRefForType(input, type, sourceFile);
  const instantiatedDirectTargetType = instantiateSemanticTargetNamedType(directTargetType, type, sourceFile, input, seen);
  if (instantiatedDirectTargetType !== undefined) {
    return instantiatedDirectTargetType;
  }
  if (directTargetType !== undefined) {
    return directTargetType;
  }
  void nextSeen;
  return undefined;
}

function instantiateSemanticTargetNamedType(
  targetType: TargetTypeRef | undefined,
  type: Type,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const typeShape = input.queries(sourceFile).typeShape;
  if (targetType?.kind !== "target-named" || !typeShape.isTypeReference(type)) {
    return undefined;
  }
  const typeArguments = typeShape.getTypeArguments(type, { sourceFile });
  if (typeArguments.length === 0) {
    return targetType;
  }
  const nextSeen = new Set(seen).add(type);
  const targetTypeArguments = typeArguments.map((argument) =>
    getCsharpTargetTypeRefFromSemanticType(argument, sourceFile, input, nextSeen));
  return targetTypeArguments.some((argument) => argument === undefined)
    ? undefined
    : {
        ...targetType,
        typeArguments: targetTypeArguments as readonly TargetTypeRef[],
      };
}


export function getCsharpTypeParameterName(
  type: Type,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): string | undefined {
  const checker = input.queries(sourceFile).checker;
  const symbol = checker.getTypeSymbol(type);
  const name = checker.getSymbolName(symbol);
  if (name === undefined || tryCsharpIdentifier(name) !== name) {
    return undefined;
  }
  return checker.getSymbolDeclarations(symbol).some((declaration) => input.ast.is.IsTypeParameterDeclaration(declaration))
    ? name
    : undefined;
}
