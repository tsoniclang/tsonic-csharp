import type {
  CsharpPlanningContext } from "../context.js";
import type {
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../policy/types/index.js";

import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import { getTargetTypeRefForType } from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  tryCsharpIdentifier,
} from "../../../policy/names/identifiers.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../../policy/types/index.js";

export function getCsharpTypeFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  seen: ReadonlySet<Type> = new Set(),
): CsharpTypeNode | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.program.source.semantics.forFile(sourceFile).types.isAny(type) ||
    input.program.source.semantics.forFile(sourceFile).types.isUnknown(type)
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
  input: CsharpPlanningContext,
): CsharpTypeNode | undefined {
  const semantics = input.program.source.semantics.forFile(sourceFile);
  const targetType = semantics.types.isBooleanLike(type)
    ? csharpSourcePrimitiveTargetType("bool")
    : semantics.types.isNumberLike(type)
      ? csharpSourcePrimitiveTargetType("float64")
      : semantics.types.isStringLike(type)
        ? csharpStringTargetType()
        : semantics.types.isBigIntLike(type)
          ? csharpBigIntegerTargetType()
          : semantics.types.isVoidLike(type)
            ? csharpVoidTargetType()
            : undefined;
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function getCsharpTargetTypeRefFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.program.source.semantics.forFile(sourceFile).types.isAny(type) ||
    input.program.source.semantics.forFile(sourceFile).types.isUnknown(type)
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
  input: CsharpPlanningContext,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const semantics = input.program.source.semantics.forFile(sourceFile);
  if (targetType?.kind !== "target-named" || !semantics.types.isTypeReference(type)) {
    return undefined;
  }
  const typeArguments = semantics.types.effectiveTypeArguments(type);
  if (typeArguments === undefined) {
    return undefined;
  }
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
  input: CsharpPlanningContext,
): string | undefined {
  const semantics = input.program.source.semantics.forFile(sourceFile);
  const symbol = semantics.declarations.typeSymbol(type);
  const name = symbol === undefined ? undefined : semantics.declarations.symbolName(symbol);
  if (name === undefined || tryCsharpIdentifier(name) !== name) {
    return undefined;
  }
  return symbol !== undefined && semantics.declarations.symbolDeclarations(symbol)
    .some((declaration) => input.program.source.ast.is.IsTypeParameterDeclaration(declaration))
    ? name
    : undefined;
}
