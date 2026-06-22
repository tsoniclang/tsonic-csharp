import {
  KindAnyKeyword,
  KindArrayType,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindObjectKeyword,
  KindTypeLiteral,
  KindTypeReference,
  KindUnknownKeyword,
  IsTypeSyntaxNode,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  Symbol,
  TargetBindingFact,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  csharpTypeFromObjectShapeFact,
} from "./object-shapes.js";
import {
  getTargetTypeRefForNode,
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import {
  csharpTargetNamedType,
  csharpSourcePrimitiveTargetType,
  csharpTargetTypeFromBinding,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  sourcePrimitiveTargetBindingId,
} from "../../source/csharp-source-semantics/identity.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  tryCsharpIdentifier,
} from "./identifiers.js";
import {
  getCsharpTypeForUnionTypeNode,
  getCsharpTypeFromRuntimeCarrier,
  getCsharpTypeFromSelectedTargetCall,
  isUnionTypeNode,
} from "./csharp-type-facts.js";

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  errorType: CsharpTypeNode = invalidCsharpType("missing C# type"),
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
    return invalidCsharpType("structural object type");
  }
  if (input.ast.kindName(node) === KindAnyKeyword || input.ast.kindName(node) === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidCsharpType("any or unknown type");
  }
  if (input.ast.kindName(node) === KindObjectKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; TypeScript object is a broad structural carrier and cannot be emitted without provider facts."));
    return invalidCsharpType("object keyword type");
  }
  if (isUnionTypeNode(input, node)) {
    return getCsharpTypeForUnionTypeNode(node, sourceFile, input, diagnostics);
  }
  const nodeType = IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
  const nodeTypeParameterName = nodeType === undefined
    ? undefined
    : getCsharpTypeParameterName(nodeType, input);
  if (nodeTypeParameterName !== undefined) {
    return { kind: "IdentifierName", name: nodeTypeParameterName };
  }
  if (input.ast.kindName(node) === KindArrayType) {
    const elementTypeNode = (node as { readonly ElementType?: Node }).ElementType;
    const elementType = getCsharpTypeForNode(elementTypeNode, sourceFile, input, invalidCsharpType("array element type"), diagnostics);
    return elementType.kind === "InvalidType"
      ? invalidCsharpType("array type")
      : { kind: "ArrayType", elementType };
  }
  const keywordType = getCsharpTypeFromKeywordTypeNode(node, input);
  if (keywordType !== undefined) {
    return keywordType;
  }
  const targetBindingType = getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
  if (targetBindingType !== undefined) {
    return targetBindingType;
  }
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  if (input.ast.kindName(node) === KindObjectBindingPattern || input.ast.kindName(node) === KindArrayBindingPattern) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Binding patterns require target destructuring lowering before C# type emission."));
    return invalidCsharpType("binding pattern type");
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
  const semanticType = getCsharpTypeFromSemanticType(nodeType, sourceFile, input);
  if (semanticType !== undefined) {
    return semanticType;
  }
  const typeDescription = input.semantics.describeTypeAtLocation(node, { sourceFile }) ?? "<unknown>";
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts. TSTS type: ${typeDescription}.`));
  return invalidCsharpType("unsupported semantic type");
}

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
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = input.types.getTypeArguments(type, { sourceFile })[0];
    const csharpElementType = getCsharpTypeFromSemanticType(elementType, sourceFile, input, nextSeen);
    return csharpElementType === undefined
      ? undefined
      : { kind: "ArrayType", elementType: csharpElementType };
  }
  if (input.types.isTuple(type)) {
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getCsharpTypeFromSemanticType(element, sourceFile, input, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "TupleType", elements: elements as readonly CsharpTypeNode[] };
  }
  if (input.types.isBooleanLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
  }
  if (input.types.isNumberLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
  }
  if (input.types.isStringLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.String"));
  }
  if (input.types.isBigIntLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Numerics.BigInteger"));
  }
  if (input.types.isVoidLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Void"));
  }
  return undefined;
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

function getCsharpTypeParameterName(type: Type, input: TargetCompileInput): string | undefined {
  const name = type.symbol?.Name;
  if (name === undefined || tryCsharpIdentifier(name) !== name) {
    return undefined;
  }
  return type.symbol?.Declarations?.some((declaration) => input.ast.is.IsTypeParameterDeclaration(declaration)) === true
    ? name
    : undefined;
}

function getCsharpTypeFromTargetBindingForReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
): CsharpTypeNode | undefined {
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding === undefined) {
    return undefined;
  }
  const carrier = input.facts.getRuntimeCarrierFact(node)?.carrier;
  if (isSourcePrimitiveBindingForCarrier(targetBinding, carrier)) {
    return undefined;
  }
  const typeArguments = getTargetTypeArgumentsForReference(node, sourceFile, input, diagnostics);
  if (typeArguments === undefined) {
    return invalidCsharpType("provider target type arguments");
  }
  const targetType = csharpTargetTypeFromBinding(targetBinding, typeArguments) ?? {
    kind: "target-named" as const,
    id: targetBinding.id,
    ...(typeArguments.length > 0 ? { typeArguments } : {}),
  };
  const csharpType = csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires a renderable target identity before C# emission."));
  return invalidCsharpType("provider target binding");
}

function getTargetTypeArgumentsForReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
): readonly TargetTypeRef[] | undefined {
  if (input.ast.kindName(node) !== KindTypeReference) {
    return [];
  }
  const typeArguments = input.ast.typeArguments(node);
  const resolved = typeArguments.map((argument) => getTargetTypeRefForNode(input, argument, sourceFile));
  if (resolved.some((argument) => argument === undefined)) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned generic target type requires target type facts for every type argument."));
    return undefined;
  }
  return resolved as readonly TargetTypeRef[];
}

function isSourcePrimitiveBindingForCarrier(binding: TargetBindingFact, carrier: TargetTypeRef | undefined): boolean {
  return carrier?.kind === "source-primitive" && binding.id === sourcePrimitiveTargetBindingId(carrier.name);
}

function getCsharpTypeFromKeywordTypeNode(node: Node, input: TargetCompileInput): CsharpTypeNode | undefined {
  switch (input.ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
    case "KindNumberKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
    case "KindStringKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.String"));
    case "KindBigIntKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Numerics.BigInteger"));
    case "KindVoidKeyword":
    case "KindNeverKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Void"));
    default:
      return undefined;
  }
}
