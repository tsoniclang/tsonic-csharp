import {
  AsArrayTypeNode,
  AsExpressionWithTypeArguments,
  AsIdentifier,
  AsPropertyAccessExpression,
  AsTypeReferenceNode,
  KindArrayBindingPattern,
  KindArrayType,
  KindAnyKeyword,
  KindBigIntKeyword,
  KindBooleanKeyword,
  KindClassDeclaration,
  KindExpressionWithTypeArguments,
  KindIdentifier,
  KindInterfaceDeclaration,
  KindNeverKeyword,
  KindNumberKeyword,
  KindObjectKeyword,
  KindObjectBindingPattern,
  KindPropertyAccessExpression,
  KindTypeLiteral,
  KindStringKeyword,
  KindTypeReference,
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
  }
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "predefined", name };
}
