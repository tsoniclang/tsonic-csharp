import type {
  SourceFile,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import {
  csharpBigIntegerTargetType,
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
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
  const nextSeen = new Set(seen).add(type);
  const typeParameterName = getCsharpTypeParameterName(type, input);
  if (typeParameterName !== undefined) {
    return { kind: "IdentifierName", name: typeParameterName };
  }
  const resolvedTargetType = getCsharpTargetTypeRefFromSemanticType(type, sourceFile, input, nextSeen);
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
  const callable = getCsharpCallableTypeFromSemanticType(type, sourceFile, input, nextSeen);
  if (callable !== undefined) {
    return callable;
  }
  if (input.types.isTuple(type)) {
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getCsharpTypeFromSemanticType(element, sourceFile, input, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "TupleType", elements: elements as readonly CsharpTypeNode[] };
  }
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = getArrayLikeElementType(type, sourceFile, input);
    const csharpElementType = getCsharpTypeFromSemanticType(elementType, sourceFile, input, nextSeen);
    return csharpElementType === undefined
      ? undefined
      : { kind: "ArrayType", elementType: csharpElementType };
  }
  if (input.types.isBooleanLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
  }
  if (input.types.isNumberLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
  }
  if (input.types.isStringLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpStringTargetType());
  }
  if (input.types.isBigIntLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpBigIntegerTargetType());
  }
  if (input.types.isVoidLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpVoidTargetType());
  }
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
  const directTargetType = getTargetTypeRefForType(input, type, sourceFile);
  const instantiatedDirectTargetType = instantiateSemanticTargetNamedType(directTargetType, type, sourceFile, input, seen);
  if (instantiatedDirectTargetType !== undefined) {
    return instantiatedDirectTargetType;
  }
  if (directTargetType !== undefined) {
    return directTargetType;
  }
  const typeParameterName = getCsharpTypeParameterName(type, input);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  const nextSeen = new Set(seen).add(type);
  const callable = getCsharpCallableTargetTypeRefFromSemanticType(type, sourceFile, input, nextSeen);
  if (callable !== undefined) {
    return callable;
  }
  if (input.types.isTuple(type)) {
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getCsharpTargetTypeRefFromSemanticType(element, sourceFile, input, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
  }
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = getArrayLikeElementType(type, sourceFile, input);
    const elementTargetType = getCsharpTargetTypeRefFromSemanticType(elementType, sourceFile, input, nextSeen);
    return elementTargetType === undefined
      ? undefined
      : { kind: "array", element: elementTargetType };
  }
  if (input.types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (input.types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (input.types.isStringLike(type)) {
    return csharpStringTargetType();
  }
  if (input.types.isBigIntLike(type)) {
    return csharpBigIntegerTargetType();
  }
  if (input.types.isVoidLike(type)) {
    return csharpVoidTargetType();
  }
  return undefined;
}

function getArrayLikeElementType(
  type: Type,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): Type | undefined {
  return input.types.isTypeReference(type)
    ? input.types.getTypeArguments(type, { sourceFile })[0]
    : undefined;
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

function getCsharpCallableTargetTypeRefFromSemanticType(
  type: Type,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const signature = input.types.getCallSignatures(type, { sourceFile })[0];
  if (signature === undefined) {
    return undefined;
  }
  const parameters = ((signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [])
    .map((parameter) => getCsharpTargetTypeRefFromSemanticType(
      input.semantics.getTypeOfSymbol(parameter, { sourceFile }),
      sourceFile,
      input,
      seen,
    ));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = input.types.getReturnTypeOfSignature(signature, { sourceFile });
  const returnCsharpType = getCsharpTargetTypeRefFromSemanticType(returnType, sourceFile, input, seen);
  return input.types.isVoidLike(returnType) || returnCsharpType === undefined
    ? csharpDelegateTargetType("System.Action", parameters as readonly TargetTypeRef[])
    : csharpDelegateTargetType("System.Func", parameters as readonly TargetTypeRef[], returnCsharpType);
}

function getCsharpCallableTypeFromSemanticType(
  type: Type,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  seen: ReadonlySet<Type>,
): CsharpTypeNode | undefined {
  const signature = input.types.getCallSignatures(type, { sourceFile })[0];
  if (signature === undefined) {
    return undefined;
  }
  const parameters = ((signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [])
    .map((parameter) => getCsharpTypeFromSemanticType(
      input.semantics.getTypeOfSymbol(parameter, { sourceFile }),
      sourceFile,
      input,
      seen,
    ));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = input.types.getReturnTypeOfSignature(signature, { sourceFile });
  const returnCsharpType = getCsharpTypeFromSemanticType(returnType, sourceFile, input, seen);
  if (returnCsharpType === undefined || input.types.isVoidLike(returnType)) {
    return {
      kind: "IdentifierName",
      name: "Action",
      ...(parameters.length > 0 ? { typeArguments: parameters as readonly CsharpTypeNode[] } : {}),
    };
  }
  return {
    kind: "IdentifierName",
    name: "Func",
    typeArguments: [...parameters as readonly CsharpTypeNode[], returnCsharpType],
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
