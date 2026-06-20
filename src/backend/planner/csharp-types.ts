import {
  AsExpressionWithTypeArguments,
  KindArrayBindingPattern,
  KindAnyKeyword,
  KindClassDeclaration,
  KindEnumDeclaration,
  KindExpressionWithTypeArguments,
  KindIdentifier,
  KindInterfaceDeclaration,
  KindObjectKeyword,
  KindObjectBindingPattern,
  KindPropertyAccessExpression,
  KindTypeLiteral,
  KindUnionType,
  KindUnknownKeyword,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode } from "../ast/csharp-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
    case KindPropertyAccessExpression:
      return getCsharpTypeForExpressionReference(node, sourceFile, input, diagnostics);
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

function getCsharpTypeForExpressionReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const sourceReferenceName = getProjectSourceReferenceTypeName(
    input.semantics.getProjectSourceReferenceForNode(node, { sourceFile }),
  );
  if (sourceReferenceName !== undefined) {
    return { kind: "named", name: sanitizeIdentifier(sourceReferenceName) };
  }
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: targetBinding.id });
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "C# type expression emission requires a provider target binding or a project-source class/interface declaration."));
  return invalidType("unresolved type expression");
}

function getProjectSourceReferenceTypeName(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
): string | undefined {
  if (reference === undefined) {
    return undefined;
  }
  if (
    reference.declaration.Kind !== KindClassDeclaration &&
    reference.declaration.Kind !== KindInterfaceDeclaration &&
    reference.declaration.Kind !== KindEnumDeclaration
  ) {
    return undefined;
  }
  return reference.symbol.Name;
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
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  if (node.Kind === KindAnyKeyword || node.Kind === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidType("any or unknown type");
  }
  if (node.Kind === KindObjectKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; TypeScript object is a broad structural carrier and cannot be emitted without provider facts."));
    return invalidType("object keyword type");
  }
  if (node.Kind === KindTypeLiteral) {
    const objectShape = input.facts.getObjectShapeFact(node);
    const objectShapeType = objectShape === undefined
      ? undefined
      : csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
    if (objectShapeType !== undefined) {
      return objectShapeType;
    }
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
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  if (contextualTargetType !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(contextualTargetType);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const nodeRuntimeCarrier = input.semantics.getRuntimeCarrierForNode(node, { sourceFile });
  if (nodeRuntimeCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(nodeRuntimeCarrier);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: targetBinding.id });
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const typeDescription = input.semantics.describeTypeAtLocation(node, { sourceFile }) ?? "<unknown>";
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts. TSTS type: ${typeDescription}.`));
  return invalidType("unsupported semantic type");
}

export function invalidCsharpType(reason: string): CsharpTypeNode {
  return { kind: "invalid", reason };
}

function invalidType(reason: string): CsharpTypeNode {
  return invalidCsharpType(reason);
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
    case "pointer":
      return right.kind === "pointer" && sameCsharpType(left.pointee, right.pointee);
    case "functionPointer":
      return right.kind === "functionPointer" &&
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

function getCsharpTypeForUnionTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  if (contextualTargetType !== undefined) {
    const contextual = csharpTypeFromTargetTypeRef(contextualTargetType);
    if (contextual !== undefined) {
      return contextual;
    }
  }
  const runtimeCarrier = input.facts.getRuntimeCarrierFact(node)?.carrier;
  if (runtimeCarrier !== undefined) {
    const carrier = csharpTypeFromTargetTypeRef(runtimeCarrier);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  const semanticRuntimeCarrier = input.semantics.getRuntimeCarrierForNode(node, { sourceFile });
  if (semanticRuntimeCarrier !== undefined) {
    const carrier = csharpTypeFromTargetTypeRef(semanticRuntimeCarrier);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Union type annotations require finalized TSTS/provider storage facts before C# emission."));
  return invalidType("union type");
}

function getCsharpTypeFromRuntimeCarrier(subject: Node, input: TargetCompileInput): CsharpTypeNode | undefined {
  const carrier = input.facts.getRuntimeCarrierFact(subject)?.carrier;
  return carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
}
