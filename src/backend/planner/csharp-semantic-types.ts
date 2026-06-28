import type {
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
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
} from "../../source/csharp-source-semantics/target-types.js";

export function getCsharpTypeFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  seen: ReadonlySet<Type> = new Set(),
): CsharpTypeNode | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.types.isAny(type) ||
    input.types.isUnknown(type)
  ) {
    return undefined;
  }
  const typeParameterName = getCsharpTypeParameterName(type, input);
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
  const intrinsicType = getCsharpIntrinsicTypeFromSemanticType(type, input);
  if (intrinsicType !== undefined) {
    return intrinsicType;
  }
  void nextSeen;
  return undefined;
}

function getCsharpIntrinsicTypeFromSemanticType(
  type: Type,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const targetType = input.types.isBooleanLike(type)
    ? csharpSourcePrimitiveTargetType("bool")
    : input.types.isNumberLike(type)
      ? csharpSourcePrimitiveTargetType("float64")
      : input.types.isStringLike(type)
        ? csharpStringTargetType()
        : input.types.isBigIntLike(type)
          ? csharpBigIntegerTargetType()
          : input.types.isVoidLike(type)
            ? csharpVoidTargetType()
            : undefined;
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function getCsharpTargetTypeRefFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.types.isAny(type) ||
    input.types.isUnknown(type)
  ) {
    return undefined;
  }
  const typeParameterName = getCsharpTypeParameterName(type, input);
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
  input: TargetCompileInput,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  if (targetType?.kind !== "target-named" || !input.types.isTypeReference(type)) {
    return undefined;
  }
  const typeArguments = input.types.getTypeArguments(type, { sourceFile });
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


export function getCsharpTypeParameterName(type: Type, input: TargetCompileInput): string | undefined {
  const symbol = input.analysis.getTypeSymbol(type);
  const name = input.analysis.getSymbolName(symbol);
  if (name === undefined || tryCsharpIdentifier(name) !== name) {
    return undefined;
  }
  return input.analysis.getSymbolDeclarations(symbol).some((declaration) => input.ast.is.IsTypeParameterDeclaration(declaration))
    ? name
    : undefined;
}
