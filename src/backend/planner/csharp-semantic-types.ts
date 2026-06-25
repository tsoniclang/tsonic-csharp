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
  void nextSeen;
  return undefined;
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
  const name = type.symbol?.Name;
  if (name === undefined || tryCsharpIdentifier(name) !== name) {
    return undefined;
  }
  return type.symbol?.Declarations?.some((declaration) => input.ast.is.IsTypeParameterDeclaration(declaration)) === true
    ? name
    : undefined;
}
