import {
  AsExpressionWithTypeArguments,
  IsTypeSyntaxNode,
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
} from "./source-ast.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import { getTargetTypeRefForNode, getTargetTypeRefForType } from "./runtime-carriers.js";
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
  switch (input.ast.kindName(node)) {
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
        case "IdentifierName":
        case "QualifiedName":
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
    input,
  );
  if (sourceReferenceName !== undefined) {
    return { kind: "IdentifierName", name: sanitizeIdentifier(sourceReferenceName) };
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
  input: TargetCompileInput,
): string | undefined {
  if (reference === undefined) {
    return undefined;
  }
  if (input.facts.getTargetBindingFact(reference.symbol) !== undefined) {
    return undefined;
  }
  const referenceFileName = input.ast.getFileName(reference.sourceFile);
  if (reference.sourceFile.IsDeclarationFile || referenceFileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  if (
    input.ast.kindName(reference.declaration) !== KindClassDeclaration &&
    input.ast.kindName(reference.declaration) !== KindInterfaceDeclaration &&
    input.ast.kindName(reference.declaration) !== KindEnumDeclaration
  ) {
    return undefined;
  }
  return reference.symbol.Name;
}

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  errorType: CsharpTypeNode = invalidType("missing C# type"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return errorType;
  }
  const selectedTargetCallType = getCsharpTypeFromSelectedTargetCall(node, input, diagnostics);
  if (selectedTargetCallType !== undefined) {
    return selectedTargetCallType;
  }
  if (input.ast.kindName(node) === KindTypeLiteral) {
    const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
    const objectShapeType = objectShape === undefined
      ? undefined
      : csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
    if (objectShapeType !== undefined) {
      return objectShapeType;
    }
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Structural object type annotations require target object-shape semantics before C# emission."));
    return invalidType("structural object type");
  }
  if (input.ast.kindName(node) === KindAnyKeyword || input.ast.kindName(node) === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidType("any or unknown type");
  }
  if (input.ast.kindName(node) === KindObjectKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; TypeScript object is a broad structural carrier and cannot be emitted without provider facts."));
    return invalidType("object keyword type");
  }
  if (input.ast.kindName(node) === KindUnionType) {
    return getCsharpTypeForUnionTypeNode(node, sourceFile, input, diagnostics);
  }
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  if (input.ast.kindName(node) === KindObjectBindingPattern || input.ast.kindName(node) === KindArrayBindingPattern) {
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
  const nodeRuntimeCarrier = getTargetTypeRefForNode(input, node, sourceFile);
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
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires a renderable target identity before C# emission."));
    return invalidType("provider target binding");
  }
  const sourceType = getSemanticTypeForNode(input, node, sourceFile);
  if (sourceTypeHasProviderEvidence(sourceType, input)) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned semantic type requires finalized provider runtime-carrier or target-binding facts before C# emission."));
    return invalidType("provider semantic type");
  }
  const sourceOwnedType = getCsharpTypeFromTstsSourceType(sourceType, sourceFile, input, diagnostics, node);
  if (sourceOwnedType !== undefined) {
    return sourceOwnedType;
  }
  const typeDescription = input.semantics.describeTypeAtLocation(node, { sourceFile }) ?? "<unknown>";
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts. TSTS type: ${typeDescription}.`));
  return invalidType("unsupported semantic type");
}

function getCsharpTypeFromTstsSourceType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticNode: Node,
): CsharpTypeNode | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (input.types.isAny(type) || input.types.isUnknown(type)) {
    diagnostics?.push(unsupportedNodeDiagnostic(diagnosticNode, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidType("any or unknown semantic type");
  }
  if (input.types.isVoidLike(type)) {
    return predefined("void");
  }
  if (input.types.isUnion(type)) {
    return undefined;
  }
  const targetRef = getTargetTypeRefForType(input, type, sourceFile);
  if (targetRef !== undefined) {
    return csharpTypeFromTargetTypeRef(targetRef);
  }
  return undefined;
}

function sourceTypeHasProviderEvidence(
  type: Type | undefined,
  input: TargetCompileInput,
): boolean {
  return type !== undefined && (
    input.facts.getRuntimeCarrierFact(type) !== undefined ||
    input.facts.getRuntimeCarrierFact(type.symbol) !== undefined ||
    input.facts.getTargetBindingFact(type) !== undefined ||
    input.facts.getTargetBindingFact(type.symbol) !== undefined
  );
}

function getCsharpTypeFromSelectedTargetCall(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const returnType = input.facts.getSelectedTargetCall(node)?.member.returnType;
  if (returnType === undefined) {
    return undefined;
  }
  const csharpType = csharpTypeFromTargetTypeRef(returnType);
  if (csharpType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Selected target call requires a renderable return type before C# type emission."));
    return invalidType("selected target call return type");
  }
  return csharpType;
}

export function invalidCsharpType(reason: string): CsharpTypeNode {
  return { kind: "InvalidType", reason };
}

function invalidType(reason: string): CsharpTypeNode {
  return invalidCsharpType(reason);
}

export function sameCsharpType(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "PredefinedType":
      return right.kind === "PredefinedType" && left.name === right.name;
    case "InvalidType":
      return right.kind === "InvalidType" && left.reason === right.reason;
    case "IdentifierName": {
      if (right.kind !== "IdentifierName" || left.name !== right.name) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "QualifiedName": {
      if (right.kind !== "QualifiedName" || left.name !== right.name || !sameCsharpType(left.left, right.left)) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "ArrayType":
      return right.kind === "ArrayType" && (left.rank ?? 1) === (right.rank ?? 1) && sameCsharpType(left.elementType, right.elementType);
    case "TupleType":
      return right.kind === "TupleType" &&
        left.elements.length === right.elements.length &&
        left.elements.every((element, index) => sameCsharpType(element, right.elements[index]!));
    case "PointerType":
      return right.kind === "PointerType" && sameCsharpType(left.pointee, right.pointee);
    case "FunctionPointerType":
      return right.kind === "FunctionPointerType" &&
        left.parameters.length === right.parameters.length &&
        left.parameters.every((parameter, index) => sameCsharpType(parameter, right.parameters[index]!)) &&
        sameCsharpType(left.returnType, right.returnType);
    case "NullableType":
      return right.kind === "NullableType" && sameCsharpType(left.inner, right.inner);
  }
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "PredefinedType", name };
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
  const semanticRuntimeCarrier = getTargetTypeRefForNode(input, node, sourceFile);
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
  const sourceFile = input.ast.getSourceFile(subject);
  if (sourceFile === undefined) {
    return undefined;
  }
  const carrier = getTargetTypeRefForNode(input, subject, sourceFile);
  return carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
}

function getSemanticTypeForNode(
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
): Type | undefined {
  return IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
}
