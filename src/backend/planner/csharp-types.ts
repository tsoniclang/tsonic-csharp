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
  KindExpressionWithTypeArguments,
  KindIdentifier,
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
  TypeFlagsAny,
  TypeFlagsBigIntLike,
  TypeFlagsBooleanLike,
  TypeFlagsNever,
  TypeFlagsNumberLike,
  TypeFlagsStringLike,
  TypeFlagsUnknown,
  TypeFlagsVoidLike,
} from "@tsonic/tsts";
import type { Node, SourceFile, SourcePrimitiveFact } from "@tsonic/tsts";
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
    return predefined("object");
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
        .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, predefined("object"), diagnostics));
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
      return getCsharpTypeForNode(node, sourceFile, input, predefined("object"), diagnostics);
  }
}

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  fallback: CsharpTypeNode = predefined("object"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return fallback;
  }
  const sourcePrimitive = input.facts.getSourcePrimitiveFact(node);
  if (sourcePrimitive !== undefined) {
    return getCsharpTypeForSourcePrimitive(sourcePrimitive);
  }
  const keywordType = getCsharpTypeForKeywordType(node.Kind);
  if (keywordType !== undefined) {
    return keywordType;
  }
  if (node.Kind === KindTypeLiteral) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Structural object type annotations require target object-shape semantics before C# emission."));
    return fallback;
  }
  if (node.Kind === KindObjectBindingPattern || node.Kind === KindArrayBindingPattern) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Binding patterns require target destructuring lowering before C# type emission."));
    return fallback;
  }
  if (node.Kind === KindArrayType) {
    const arrayType = AsArrayTypeNode(node)!;
    return {
      kind: "array",
      elementType: getCsharpTypeForNode(arrayType.ElementType, sourceFile, input, predefined("object"), diagnostics),
    };
  }
  if (node.Kind === KindTypeReference) {
    const typeReference = AsTypeReferenceNode(node)!;
    const rendered = expressionToCsharpType(typeReference.TypeName, sourceFile, input, diagnostics);
    const typeArguments = (typeReference.TypeArguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, predefined("object"), diagnostics));
    if (typeArguments.length === 0) {
      return rendered;
    }
    switch (rendered.kind) {
      case "named":
        return { ...rendered, typeArguments };
      case "qualified":
        return { ...rendered, typeArguments };
      default:
        return fallback;
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
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  if (type === undefined) {
    return fallback;
  }
  const typeRuntimeCarrier = input.facts.getRuntimeCarrierFact(type)?.carrier;
  if (typeRuntimeCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(typeRuntimeCarrier);
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
    return predefined("long");
  }
  if ((type.flags & TypeFlagsNumberLike) !== 0) {
    return predefined("double");
  }
  if ((type.flags & TypeFlagsVoidLike) !== 0) {
    return predefined("void");
  }
  if ((type.flags & (TypeFlagsAny | TypeFlagsUnknown | TypeFlagsNever)) !== 0) {
    return predefined("object");
  }
  return fallback;
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
      return predefined("long");
    case KindVoidKeyword:
      return predefined("void");
    case KindObjectKeyword:
    case KindAnyKeyword:
    case KindUnknownKeyword:
    case KindNeverKeyword:
      return predefined("object");
    default:
      return undefined;
  }
}

export function sameCsharpType(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "predefined":
      return right.kind === "predefined" && left.name === right.name;
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
