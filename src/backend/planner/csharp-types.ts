import {
  AsArrayTypeNode,
  AsExpressionWithTypeArguments,
  AsFunctionTypeNode,
  AsIdentifier,
  AsLiteralTypeNode,
  AsParameterDeclaration,
  AsPropertyAccessExpression,
  AsTypeReferenceNode,
  AsTupleTypeNode,
  AsUnionTypeNode,
  KindArrayBindingPattern,
  KindArrayType,
  KindAnyKeyword,
  KindBigIntKeyword,
  KindBooleanKeyword,
  KindClassDeclaration,
  KindExpressionWithTypeArguments,
  KindFunctionType,
  KindIdentifier,
  KindInterfaceDeclaration,
  KindLiteralType,
  KindNeverKeyword,
  KindNullKeyword,
  KindNumberKeyword,
  KindObjectKeyword,
  KindObjectBindingPattern,
  KindPropertyAccessExpression,
  KindTypeLiteral,
  KindStringKeyword,
  KindTypeReference,
  KindTupleType,
  KindUndefinedKeyword,
  KindUnionType,
  KindUnknownKeyword,
  KindVoidKeyword,
  Node_Text,
  Type_AsTypeReference,
  TypeFlagsAny,
  TypeFlagsBigIntLike,
  TypeFlagsBooleanLike,
  TypeFlagsNever,
  TypeFlagsNumberLike,
  TypeFlagsStringLike,
  TypeFlagsTypeParameter,
  TypeFlagsUnknown,
  TypeFlagsVoidLike,
} from "@tsonic/tsts";
import type { Node, SourceFile, SourcePrimitiveFact, Type } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode } from "../ast/csharp-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { csharpTypeFromSourcePrimitiveKind, csharpTypeFromTargetTypeRef } from "./target-types.js";

export function expressionToCsharpType(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return invalidType("missing type expression");
  }
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "named", name: sanitizeIdentifier(AsIdentifier(node)!.Text) };
    case KindPropertyAccessExpression: {
      const expression = AsPropertyAccessExpression(node)!;
      const receiver = expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics);
      const name = sanitizeIdentifier(Node_Text(expression.name!));
      return { kind: "qualified", left: receiver, name };
    }
    case KindExpressionWithTypeArguments: {
      const expression = AsExpressionWithTypeArguments(node)!;
      const rendered = expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics);
      const typeArguments = (expression.TypeArguments?.Nodes ?? [])
        .filter((argument): argument is Node => argument !== undefined)
        .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, invalidType("missing type argument"), diagnostics));
      if (typeArguments.length === 0) {
        return rendered;
      }
      switch (rendered.kind) {
        case "named":
        case "qualified":
          return { ...rendered, typeArguments };
        default:
          return rendered;
      }
    }
    default:
      return getCsharpTypeForNode(node, sourceFile, input, invalidType("unsupported type expression"), diagnostics);
  }
}

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  fallback: CsharpTypeNode = invalidType("missing C# type"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return fallback;
  }
  const sourcePrimitive = input.facts.getSourcePrimitiveFact(node);
  if (sourcePrimitive !== undefined) {
    return getCsharpTypeForSourcePrimitive(sourcePrimitive);
  }
  if (node.Kind === KindAnyKeyword || node.Kind === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidType("any or unknown type");
  }
  const keywordType = getCsharpTypeForKeywordType(node.Kind);
  if (keywordType !== undefined) {
    return keywordType;
  }
  if (node.Kind === KindTypeLiteral) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Structural object type annotations require target object-shape semantics before C# emission."));
    return invalidType("structural object type");
  }
  if (node.Kind === KindUnionType) {
    return getCsharpTypeForUnionTypeNode(node, sourceFile, input, diagnostics);
  }
  if (node.Kind === KindObjectBindingPattern || node.Kind === KindArrayBindingPattern) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Binding patterns require target destructuring lowering before C# type emission."));
    return invalidType("binding pattern type");
  }
  if (node.Kind === KindArrayType) {
    const arrayType = AsArrayTypeNode(node)!;
    return {
      kind: "array",
      elementType: getCsharpTypeForNode(arrayType.ElementType, sourceFile, input, invalidType("array element type"), diagnostics),
    };
  }
  if (node.Kind === KindTupleType) {
    const tupleType = AsTupleTypeNode(node)!;
    return {
      kind: "tuple",
      elements: (tupleType.Elements?.Nodes ?? [])
        .filter((element): element is Node => element !== undefined)
        .map((element) => getCsharpTypeForNode(element, sourceFile, input, invalidType("tuple element type"), diagnostics)),
    };
  }
  if (node.Kind === KindFunctionType) {
    return getCsharpTypeForFunctionTypeNode(node, sourceFile, input, diagnostics);
  }
  if (node.Kind === KindTypeReference) {
    const typeReference = AsTypeReferenceNode(node)!;
    const rendered = expressionToCsharpType(typeReference.TypeName, sourceFile, input, diagnostics);
    const typeArguments = (typeReference.TypeArguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, invalidType("type reference argument"), diagnostics));
    if (typeArguments.length === 0) {
      return rendered;
    }
    switch (rendered.kind) {
      case "named":
        return { ...rendered, typeArguments };
      case "qualified":
        return { ...rendered, typeArguments };
      default:
        return invalidType("type reference target");
    }
  }
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  if (contextualTargetType !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(contextualTargetType);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const nodeRuntimeCarrier = input.facts.getRuntimeCarrierFact(node)?.carrier;
  if (nodeRuntimeCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(nodeRuntimeCarrier);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const symbol = input.checker.getSymbolAtLocation(node, { sourceFile }) ?? input.checker.getResolvedSymbol(node, { sourceFile });
  const targetBinding = input.facts.getTargetBindingFact(symbol);
  if (targetBinding !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: targetBinding.id });
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  if (type === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type, but TSTS did not return a type for this node."));
    return invalidType("missing TSTS type");
  }
  const semanticType = getCsharpTypeForTstsType(type, sourceFile, input, diagnostics, node);
  if (semanticType !== undefined) {
    return semanticType;
  }
  return invalidType("unsupported semantic type");
}

function getCsharpTypeForTstsType(
  type: Type,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticNode: Node,
): CsharpTypeNode | undefined {
  const typeRuntimeCarrier = input.facts.getRuntimeCarrierFact(type)?.carrier;
  if (typeRuntimeCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(typeRuntimeCarrier);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const typeSymbol = type.symbol;
  const typeTargetBinding = input.facts.getTargetBindingFact(typeSymbol);
  if (typeTargetBinding !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: typeTargetBinding.id });
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const typeReference = Type_AsTypeReference(type);
  const typeReferenceTargetSymbol = typeReference?.__tsgoEmbedded0?.target?.symbol;
  if (typeReference !== undefined && (typeReferenceTargetSymbol?.Name ?? typeSymbol?.Name) !== undefined) {
    const typeName = typeReferenceTargetSymbol?.Name ?? typeSymbol!.Name;
    const typeArguments = (typeReference.resolvedTypeArguments ?? [])
      .filter((argument): argument is Type => argument !== undefined)
      .map((argument) => getCsharpTypeForTstsType(argument, sourceFile, input, diagnostics, diagnosticNode) ?? invalidType("unresolved generic type argument"));
    return typeArguments.length === 0
      ? { kind: "named", name: sanitizeIdentifier(typeName) }
      : { kind: "named", name: sanitizeIdentifier(typeName), typeArguments };
  }
  if ((type.flags & TypeFlagsTypeParameter) !== 0 && typeSymbol?.Name !== undefined && typeSymbol.Name.length > 0) {
    return { kind: "named", name: sanitizeIdentifier(typeSymbol.Name) };
  }
  const typeDeclaration = typeSymbol?.ValueDeclaration ?? typeSymbol?.Declarations?.find((candidate) => candidate !== undefined);
  if (typeDeclaration?.Kind === KindClassDeclaration || typeDeclaration?.Kind === KindInterfaceDeclaration) {
    return { kind: "named", name: sanitizeIdentifier(typeSymbol!.Name) };
  }
  const typeText = input.checker.typeToString(type, { sourceFile });
  if (typeText === "void") {
    return predefined("void");
  }
  if ((type.flags & TypeFlagsStringLike) !== 0) {
    return predefined("string");
  }
  if ((type.flags & TypeFlagsBooleanLike) !== 0) {
    return predefined("bool");
  }
  if ((type.flags & TypeFlagsBigIntLike) !== 0) {
    return bigIntegerType();
  }
  if ((type.flags & TypeFlagsNumberLike) !== 0) {
    return predefined("double");
  }
  if ((type.flags & TypeFlagsVoidLike) !== 0) {
    return predefined("void");
  }
  if ((type.flags & (TypeFlagsAny | TypeFlagsUnknown)) !== 0) {
    diagnostics?.push(unsupportedNodeDiagnostic(diagnosticNode, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return undefined;
  }
  if ((type.flags & TypeFlagsNever) !== 0) {
    return predefined("void");
  }
  diagnostics?.push(unsupportedNodeDiagnostic(diagnosticNode, `C# emission requires a closed target type from TSTS or provider facts. TSTS type: ${typeText ?? "<unknown>"}.`));
  return undefined;
}

export function getCsharpTypeForSourcePrimitive(fact: SourcePrimitiveFact): CsharpTypeNode {
  return csharpTypeFromSourcePrimitiveKind(fact.kind);
}

function getCsharpTypeForKeywordType(kind: number): CsharpTypeNode | undefined {
  switch (kind) {
    case KindStringKeyword:
      return predefined("string");
    case KindNumberKeyword:
      return predefined("double");
    case KindBooleanKeyword:
      return predefined("bool");
    case KindBigIntKeyword:
      return bigIntegerType();
    case KindVoidKeyword:
      return predefined("void");
    case KindObjectKeyword:
      return predefined("object");
    case KindNeverKeyword:
      return predefined("void");
    default:
      return undefined;
  }
}

function invalidType(reason: string): CsharpTypeNode {
  return { kind: "invalid", reason };
}

function bigIntegerType(): CsharpTypeNode {
  return {
    kind: "qualified",
    left: {
      kind: "qualified",
      left: { kind: "named", name: "System" },
      name: "Numerics",
    },
    name: "BigInteger",
  };
}

export function sameCsharpType(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "predefined":
      return right.kind === "predefined" && left.name === right.name;
    case "invalid":
      return right.kind === "invalid" && left.reason === right.reason;
    case "named": {
      if (right.kind !== "named" || left.name !== right.name) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "qualified": {
      if (right.kind !== "qualified" || left.name !== right.name || !sameCsharpType(left.left, right.left)) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "array":
      return right.kind === "array" && (left.rank ?? 1) === (right.rank ?? 1) && sameCsharpType(left.elementType, right.elementType);
    case "tuple":
      return right.kind === "tuple" &&
        left.elements.length === right.elements.length &&
        left.elements.every((element, index) => sameCsharpType(element, right.elements[index]!));
    case "function":
      return right.kind === "function" &&
        left.parameters.length === right.parameters.length &&
        left.parameters.every((parameter, index) => sameCsharpType(parameter, right.parameters[index]!)) &&
        sameCsharpType(left.returnType, right.returnType);
    case "nullable":
      return right.kind === "nullable" && sameCsharpType(left.inner, right.inner);
  }
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "predefined", name };
}

function getCsharpTypeForFunctionTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const functionType = AsFunctionTypeNode(node)!;
  const typeParameters = functionType.TypeParameters?.Nodes ?? [];
  if (typeParameters.some((typeParameter) => typeParameter !== undefined)) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Generic function types require target delegate facts before C# emission."));
    return invalidType("generic function type");
  }
  const parameters = (functionType.Parameters?.Nodes ?? [])
    .filter((parameter): parameter is Node => parameter !== undefined)
    .map((parameter) => getCsharpTypeForFunctionTypeParameter(parameter, sourceFile, input, diagnostics));
  if (parameters.some((parameter) => parameter.kind === "invalid")) {
    return invalidType("function type parameter");
  }
  return {
    kind: "function",
    parameters,
    returnType: getCsharpTypeForNode(functionType.Type, sourceFile, input, predefined("void"), diagnostics),
  };
}

function getCsharpTypeForFunctionTypeParameter(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const parameter = AsParameterDeclaration(node)!;
  if (parameter.DotDotDotToken !== undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Rest parameters in function types require target delegate facts before C# emission."));
    return invalidType("function type rest parameter");
  }
  if (parameter.QuestionToken !== undefined || parameter.Initializer !== undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Optional/defaulted function-type parameters require target delegate facts before C# emission."));
    return invalidType("function type optional parameter");
  }
  if (parameter.Type === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Function-type parameters must have closed TSTS types before C# emission."));
    return invalidType("function type untyped parameter");
  }
  return getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics);
}

function getCsharpTypeForUnionTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const unionType = AsUnionTypeNode(node)!;
  const members = (unionType.Types?.Nodes ?? []).filter((member): member is Node => member !== undefined);
  const nonNullishMembers = members.filter((member) => !isNullishTypeNode(member));
  if (nonNullishMembers.length !== 1 || nonNullishMembers.length === members.length) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Union type annotations require nullable shape or finalized runtime-carrier facts before C# emission."));
    return invalidType("union type");
  }
  const inner = getCsharpTypeForNode(nonNullishMembers[0], sourceFile, input, undefined, diagnostics);
  return inner.kind === "invalid" ? inner : { kind: "nullable", inner };
}

function isNullishTypeNode(node: Node): boolean {
  if (node.Kind === KindUndefinedKeyword || node.Kind === KindNullKeyword) {
    return true;
  }
  if (node.Kind !== KindLiteralType) {
    return false;
  }
  return AsLiteralTypeNode(node)!.Literal?.Kind === KindNullKeyword;
}
