import {
  AsCallExpression,
  AsNewExpression,
  AsPropertyAccessExpression,
  KindAnyKeyword,
  KindArrayType,
  KindArrayBindingPattern,
  KindCallExpression,
  KindNewExpression,
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
  csharpBigIntegerTargetType,
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetTypeFromBinding,
  csharpVoidTargetType,
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
  getCallableSemanticOwnership,
} from "./semantic-guards.js";
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
  const sourceNewExpressionType = getCsharpTypeFromSourceNewExpression(node, sourceFile, input, diagnostics);
  if (sourceNewExpressionType !== undefined) {
    return sourceNewExpressionType;
  }
  const sourceCallReturnType = getCsharpTypeFromResolvedSourceCallReturn(node, sourceFile, input, diagnostics);
  if (sourceCallReturnType !== undefined) {
    return sourceCallReturnType;
  }
  const selectedTargetCallType = getCsharpTypeFromSelectedTargetCall(node, input, diagnostics);
  if (selectedTargetCallType !== undefined) {
    return selectedTargetCallType;
  }
  const targetConversionType = getCsharpTypeFromTargetConversion(node, input, diagnostics);
  if (targetConversionType !== undefined) {
    return targetConversionType;
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
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  const targetBindingType = getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
  if (targetBindingType !== undefined) {
    return targetBindingType;
  }
  const callableSemanticType = nodeType === undefined
    ? undefined
    : getCsharpCallableTypeFromSemanticType(nodeType, sourceFile, input, new Set());
  if (callableSemanticType !== undefined) {
    return callableSemanticType;
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

function getCsharpTypeFromTargetConversion(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const convertedType = input.facts.getTargetConversionFact(node)?.convertedType;
  if (convertedType === undefined) {
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(convertedType);
  if (type !== undefined) {
    return type;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Target conversion facts require a renderable converted type before C# type emission."));
  return invalidCsharpType("target conversion type");
}

function getCsharpTypeFromResolvedSourceCallReturn(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindCallExpression) {
    return undefined;
  }
  const call = AsCallExpression(node)!;
  const ownership = getCallableSemanticOwnership(call.Expression, sourceFile, input);
  if (!ownership.sourceOwned) {
    return undefined;
  }
  const annotatedReturnType = getCsharpTypeFromSourceCallReturnAnnotation(node, call, sourceFile, input, diagnostics);
  if (annotatedReturnType !== undefined) {
    return annotatedReturnType;
  }
  const carrier = input.semantics.getResolvedCallReturnRuntimeCarrier(node, { sourceFile });
  if (carrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(carrier);
    if (csharpType === undefined) {
      diagnostics?.push(unsupportedNodeDiagnostic(node, "Resolved source call return carrier requires a renderable C# type before emission."));
      return invalidCsharpType("source call return carrier");
    }
    return csharpType;
  }
  const returnType = input.semantics.getResolvedCallReturnType(node, { sourceFile });
  return getCsharpTypeFromSemanticType(returnType, sourceFile, input);
}

function getCsharpTypeFromSourceNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindNewExpression) {
    return undefined;
  }
  const expression = AsNewExpression(node);
  const reference = expression === undefined
    ? undefined
    : input.semantics.getProjectSourceReferenceForNode(expression.Expression, { sourceFile });
  if (expression === undefined || reference === undefined || !input.ast.is.IsClassDeclaration(reference.declaration)) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, invalidCsharpType("source construction type argument"), diagnostics));
  if (typeArguments.length === 0) {
    return undefined;
  }
  const baseType = getCsharpTypeForNode(expression.Expression, sourceFile, input, invalidCsharpType("source construction type"), diagnostics);
  return withCsharpTypeArguments(baseType, typeArguments);
}

function getCsharpTypeFromSourceCallReturnAnnotation(
  node: Node,
  call: ReturnType<typeof AsCallExpression>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (call === undefined) {
    return undefined;
  }
  const reference = input.semantics.getProjectSourceReferenceForNode(call.Expression, { sourceFile });
  const returnTypeNode = (reference?.declaration as { readonly Type?: Node } | undefined)?.Type;
  if (reference === undefined || returnTypeNode === undefined) {
    return undefined;
  }
  const substitutions = getSourceCallTypeParameterSubstitutions(node, call, reference.declaration, sourceFile, input, diagnostics);
  const returnType = getCsharpTypeForNode(returnTypeNode, reference.sourceFile, input, invalidCsharpType("source call return type"), diagnostics);
  return substituteCsharpTypeNode(returnType, substitutions);
}

function getSourceCallTypeParameterSubstitutions(
  node: Node,
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  selectedDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): ReadonlyMap<string, CsharpTypeNode> {
  const substitutions = new Map<string, CsharpTypeNode>();
  const callee = AsPropertyAccessExpression(call.Expression);
  const receiver = callee?.Expression;
  if (receiver !== undefined) {
    const receiverType = getCsharpTypeForNode(receiver, sourceFile, input, invalidCsharpType("source call receiver type"), diagnostics);
    addCsharpTypeParameterSubstitutions(input, substitutions, input.ast.parent(selectedDeclaration), getCsharpTypeArguments(receiverType));
  }
  const explicitTypeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, invalidCsharpType("source call type argument"), diagnostics));
  if (explicitTypeArguments.length > 0) {
    addCsharpTypeParameterSubstitutions(input, substitutions, selectedDeclaration, explicitTypeArguments);
  }
  return substitutions;
}

function addCsharpTypeParameterSubstitutions(
  input: TargetCompileInput,
  substitutions: Map<string, CsharpTypeNode>,
  declaration: Node | undefined,
  typeArguments: readonly CsharpTypeNode[],
): void {
  if (declaration === undefined || typeArguments.length === 0) {
    return;
  }
  const typeParameters = input.ast.typeParameters(declaration);
  for (let index = 0; index < typeParameters.length; index += 1) {
    const name = input.ast.text(input.ast.name(typeParameters[index]));
    const typeArgument = typeArguments[index];
    if (name.length > 0 && typeArgument !== undefined) {
      substitutions.set(name, typeArgument);
    }
  }
}

function getCsharpTypeArguments(type: CsharpTypeNode): readonly CsharpTypeNode[] {
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? type.typeArguments ?? []
    : [];
}

function withCsharpTypeArguments(
  type: CsharpTypeNode,
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode {
  if (typeArguments.length === 0) {
    return type;
  }
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? { ...type, typeArguments }
    : type;
}

function substituteCsharpTypeNode(
  type: CsharpTypeNode,
  substitutions: ReadonlyMap<string, CsharpTypeNode>,
): CsharpTypeNode {
  if (substitutions.size === 0) {
    return type;
  }
  switch (type.kind) {
    case "IdentifierName":
      return substitutions.get(type.name) ?? {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "QualifiedName":
      return {
        ...type,
        left: substituteCsharpTypeNode(type.left, substitutions),
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "ArrayType":
      return { ...type, elementType: substituteCsharpTypeNode(type.elementType, substitutions) };
    case "TupleType":
      return { ...type, elements: type.elements.map((element) => substituteCsharpTypeNode(element, substitutions)) };
    case "PointerType":
      return { ...type, pointee: substituteCsharpTypeNode(type.pointee, substitutions) };
    case "FunctionPointerType":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => substituteCsharpTypeNode(parameter, substitutions)),
        returnType: substituteCsharpTypeNode(type.returnType, substitutions),
      };
    case "NullableType":
      return { ...type, inner: substituteCsharpTypeNode(type.inner, substitutions) };
    case "PredefinedType":
    case "InvalidType":
      return type;
  }
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
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = getArrayLikeElementType(type, sourceFile, input);
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
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = getArrayLikeElementType(type, sourceFile, input);
    const elementTargetType = getCsharpTargetTypeRefFromSemanticType(elementType, sourceFile, input, nextSeen);
    return elementTargetType === undefined
      ? undefined
      : { kind: "array", element: elementTargetType };
  }
  if (input.types.isTuple(type)) {
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getCsharpTargetTypeRefFromSemanticType(element, sourceFile, input, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
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
  const targetType = csharpTargetTypeFromBinding(targetBinding, typeArguments);
  if (targetType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires explicit C# render metadata before C# emission."));
    return invalidCsharpType("provider target binding");
  }
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
      return csharpTypeFromTargetTypeRef(csharpStringTargetType());
    case "KindBigIntKeyword":
      return csharpTypeFromTargetTypeRef(csharpBigIntegerTargetType());
    case "KindVoidKeyword":
    case "KindNeverKeyword":
      return csharpTypeFromTargetTypeRef(csharpVoidTargetType());
    default:
      return undefined;
  }
}
