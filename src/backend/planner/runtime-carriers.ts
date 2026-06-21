import type { ExtensionFactSubject, Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  AsArrayLiteralExpression,
  HasSourceKind,
  IsTypeSyntaxNode,
  KindArrayLiteralExpression,
  KindArrayType,
  KindRegularExpressionLiteral,
  KindTypeLiteral,
  KindTypeReference,
  KindUnionType,
} from "./source-ast.js";
import { targetTypeRefsMatch } from "./target-types.js";
import { csharpObjectShapeFactKey } from "../../source/csharp-facts.js";

export function getRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function getTargetTypeRefForNode(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  if (HasSourceKind(input.ast, sourceNode, KindTypeReference) || IsTypeSyntaxNode(input.ast, sourceNode)) {
    return getTargetTypeRefFromTypeReferenceAlias(input, sourceNode, sourceFile) ??
      getTargetTypeRefFromDirectFacts(input, sourceNode) ??
      getTargetTypeRefFromSyntax(input, sourceNode, sourceFile) ??
      getTargetTypeRefForType(input, getSemanticTypeForNode(input, sourceNode, sourceFile), sourceFile);
  }
  return input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile }) ??
    getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromSelectedOperation(input, sourceNode, sourceFile) ??
    getCatchVariableTargetTypeRef(input, sourceNode, sourceFile) ??
    getTargetTypeRefFromSyntax(input, sourceNode, sourceFile) ??
    getTargetTypeRefFromDeclarationAnnotation(input, sourceNode, sourceFile) ??
    getTargetTypeRefForType(input, getSemanticTypeForNode(input, sourceNode, sourceFile), sourceFile);
}

function getCatchVariableTargetTypeRef(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const symbol = input.semantics.getSymbolAtLocation(sourceNode, { sourceFile });
  const declarations = getSymbolDeclarations(symbol);
  return declarations.some((declaration) => {
      const parent = asNode(getNodeField(declaration, "Parent"));
      return input.ast.kindName(parent) === "KindCatchClause";
    })
    ? { kind: "target-named", id: "System.Exception" }
    : undefined;
}

function getTargetTypeRefFromSelectedOperation(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const resultType = input.facts.getSelectedTargetOperator(sourceNode)?.resultType ??
    input.facts.getSelectedTargetProperty(sourceNode)?.resultType ??
    input.facts.getSelectedTargetElementAccess(sourceNode)?.resultType ??
    input.facts.getSelectedTargetCall(sourceNode)?.member.returnType;
  return resultType === undefined || resultType === sourceNode
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, resultType) ??
      (asNode(resultType) === undefined ? undefined : getTargetTypeRefForNode(input, asNode(resultType), sourceFile));
}

export function getTargetTypeRefForType(
  input: TargetCompileInput,
  type: Type | undefined,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type> = new Set(),
): TargetTypeRef | undefined {
  if (type === undefined || seen.has(type)) {
    return undefined;
  }
  const direct = getTargetTypeRefFromDirectFacts(input, type) ??
    getTargetTypeRefFromDirectFacts(input, type.symbol);
  if (direct !== undefined) {
    return direct;
  }
  const typeParameterName = getTypeParameterName(input, type);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  if (input.types.isBooleanLike(type)) {
    return { kind: "source-primitive", name: "bool" };
  }
  if (input.types.isNumberLike(type)) {
    return { kind: "source-primitive", name: "float64" };
  }
  if (input.types.isStringLike(type)) {
    return { kind: "target-named", id: "System.String" };
  }
  if (input.types.isBigIntLike(type)) {
    return { kind: "target-named", id: "System.Numerics.BigInteger" };
  }
  if (input.types.isVoidLike?.(type) === true) {
    return { kind: "target-named", id: "System.Void" };
  }
  if (input.types.isUnion?.(type) === true) {
    const nullable = getNullableUnionTargetTypeRef(input, type, sourceFile, seen);
    if (nullable !== undefined) {
      return nullable;
    }
  }
  if (isSourceLibraryType(input, type, "Promise", sourceFile)) {
    const nextSeen = new Set(seen).add(type);
    const result = getTargetTypeRefForType(input, getFirstTypeArgument(input, type, sourceFile), sourceFile, nextSeen);
    return result === undefined || isVoidTargetType(result)
      ? { kind: "target-named", id: "System.Threading.Tasks.Task" }
      : { kind: "target-named", id: "System.Threading.Tasks.Task`1", typeArguments: [result] };
  }
  if (input.types.isTuple?.(type) === true) {
    const nextSeen = new Set(seen).add(type);
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getTargetTypeRefForType(input, element, sourceFile, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
  }
  if (isSourceLibraryType(input, type, "Array", sourceFile) || isSourceLibraryType(input, type, "ReadonlyArray", sourceFile)) {
    const nextSeen = new Set(seen).add(type);
    const element = getTargetTypeRefForType(input, getFirstTypeArgument(input, type, sourceFile), sourceFile, nextSeen);
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (input.types.isArrayLike?.(type, { sourceFile }) === true) {
    const nextSeen = new Set(seen).add(type);
    const element = getTargetTypeRefForType(input, getFirstTypeArgument(input, type, sourceFile), sourceFile, nextSeen);
    return element === undefined ? undefined : { kind: "array", element };
  }
  const callable = getCallableTargetTypeRefForSemanticType(input, type, sourceFile, seen);
  if (callable !== undefined) {
    return callable;
  }
  if (isSourceLibraryType(input, type, "RegExp", sourceFile)) {
    return { kind: "target-named", id: "Tsonic.CSharp.Js.RegExp" };
  }
  return getTargetTypeRefForProjectSourceType(input, type, sourceFile);
}

function getCallableTargetTypeRefForSemanticType(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const signatures = input.types.getCallSignatures(type, { sourceFile });
  if (signatures.length !== 1) {
    return undefined;
  }
  const nextSeen = new Set(seen).add(type);
  const signature = signatures[0]!;
  const parameters = (signature as { readonly parameters?: readonly ExtensionFactSubject[] }).parameters ?? [];
  const parameterTypes = parameters.map((parameter) =>
    getTargetTypeRefForType(input, input.semantics.getTypeOfSymbol(parameter, { sourceFile }), sourceFile, nextSeen));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForType(input, input.types.getReturnTypeOfSignature(signature, { sourceFile }), sourceFile, nextSeen);
  return returnType === undefined || isVoidTargetType(returnType)
    ? { kind: "target-named", id: `System.Action\`${parameterTypes.length}`, typeArguments: parameterTypes as readonly TargetTypeRef[] }
    : { kind: "target-named", id: `System.Func\`${parameterTypes.length + 1}`, typeArguments: [...(parameterTypes as readonly TargetTypeRef[]), returnType] };
}

function getNullableUnionTargetTypeRef(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const unionTypes = input.types.getUnionOrIntersectionTypes?.(type) ?? [];
  const nonNullish = unionTypes.filter((candidate) => input.types.isNullish?.(candidate) !== true);
  if (nonNullish.length !== 1 || nonNullish.length === unionTypes.length) {
    return undefined;
  }
  const inner = getTargetTypeRefForType(input, nonNullish[0], sourceFile, new Set(seen).add(type));
  return inner === undefined
    ? undefined
    : { kind: "target-named", id: "System.Nullable`1", typeArguments: [inner] };
}

function getFirstTypeArgument(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
): Type | undefined {
  const typeArgument = input.types.isTypeReference?.(type) === true
    ? input.types.getTypeArguments(type, { sourceFile })[0]
    : undefined;
  if (typeArgument !== undefined) {
    return typeArgument;
  }
  return input.types.getIndexInfos(type, { sourceFile })
    .map((info) => (info as { readonly valueType?: unknown }).valueType)
    .find((value): value is Type => isType(value));
}

function getTargetTypeRefFromDirectFacts(
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const targetTypeRef = asTargetTypeRef(subject);
  if (targetTypeRef !== undefined) {
    return targetTypeRef;
  }
  const runtimeCarrier = input.facts.getRuntimeCarrierFact(subject)?.carrier;
  if (runtimeCarrier !== undefined) {
    return runtimeCarrier;
  }
  const pointer = input.facts.getPointerFact(subject);
  if (pointer !== undefined) {
    const pointee = getTargetTypeRefFromDirectFacts(input, pointer.pointee);
    if (pointee !== undefined) {
      return {
        kind: "pointer",
        pointee,
        mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
      };
    }
  }
  const functionPointer = input.facts.getFunctionPointerFact(subject);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => getTargetTypeRefFromDirectFacts(input, parameter));
    const result = getTargetTypeRefFromDirectFacts(input, functionPointer.result);
    if (result !== undefined && args.every((argument) => argument !== undefined)) {
      return {
        kind: "function-pointer",
        args: args as readonly TargetTypeRef[],
        result,
        ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
      };
    }
  }
  const primitive = input.facts.getSourcePrimitiveFact(subject);
  if (primitive !== undefined) {
    return { kind: "source-primitive", name: primitive.kind };
  }
  const binding = input.facts.getTargetBindingFact(subject);
  if (binding !== undefined) {
    return { kind: "target-named", id: binding.id };
  }
  return undefined;
}

function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}

function getTargetTypeRefFromSyntax(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const keywordType = getTargetTypeRefFromKeywordTypeSyntax(input, sourceNode);
  if (keywordType !== undefined) {
    return keywordType;
  }
  if (HasSourceKind(input.ast, sourceNode, KindRegularExpressionLiteral)) {
    return { kind: "target-named", id: "Tsonic.CSharp.Js.RegExp" };
  }
  if (HasSourceKind(input.ast, sourceNode, KindTypeReference)) {
    return getTargetTypeRefFromTypeReferenceSyntax(input, sourceNode, sourceFile);
  }
  if (HasSourceKind(input.ast, sourceNode, KindArrayType)) {
    const element = getTargetTypeRefForNode(input, asNode(getNodeField(sourceNode, "ElementType")), sourceFile);
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (HasSourceKind(input.ast, sourceNode, KindUnionType)) {
    const nullable = getNullableUnionTargetTypeRefFromSyntax(input, sourceNode, sourceFile);
    if (nullable !== undefined) {
      return nullable;
    }
  }
  if (HasSourceKind(input.ast, sourceNode, KindTypeLiteral)) {
    const objectShape = input.facts.getFact(sourceNode, csharpObjectShapeFactKey);
    if (objectShape !== undefined) {
      return objectShape.targetType;
    }
  }
  if (!HasSourceKind(input.ast, sourceNode, KindArrayLiteralExpression)) {
    return isFunctionTypeSyntax(input, sourceNode)
      ? getTargetTypeRefFromFunctionTypeSyntax(input, sourceNode, sourceFile)
      : undefined;
  }
  const elements = (AsArrayLiteralExpression(sourceNode)?.Elements?.Nodes ?? [])
    .filter((element): element is Node => element !== undefined)
    .map((element) => getTargetTypeRefForNode(input, element, sourceFile));
  if (elements.length === 0 || elements.some((element) => element === undefined)) {
    return undefined;
  }
  const first = elements[0]!;
  return elements.every((element) => element !== undefined && targetTypeRefsMatch(first, element))
    ? { kind: "array", element: first }
    : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
}

function getTargetTypeRefFromKeywordTypeSyntax(
  input: TargetCompileInput,
  sourceNode: Node,
): TargetTypeRef | undefined {
  switch (input.ast.kindName(sourceNode)) {
    case "KindBooleanKeyword":
      return { kind: "source-primitive", name: "bool" };
    case "KindNumberKeyword":
      return { kind: "source-primitive", name: "float64" };
    case "KindStringKeyword":
      return { kind: "target-named", id: "System.String" };
    case "KindBigIntKeyword":
      return { kind: "target-named", id: "System.Numerics.BigInteger" };
    case "KindVoidKeyword":
      return { kind: "target-named", id: "System.Void" };
    default:
      return undefined;
  }
}

function isFunctionTypeSyntax(input: TargetCompileInput, sourceNode: Node): boolean {
  const kind = input.ast.kindName(sourceNode);
  return kind === "KindFunctionType" || kind === "KindConstructorType";
}

function getTargetTypeRefFromTypeReferenceSyntax(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const typeName = asNode(getNodeField(sourceNode, "TypeName"));
  if (typeName === undefined) {
    return undefined;
  }
  const semanticType = input.semantics.getTypeFromTypeNode(sourceNode, { sourceFile });
  const aliased = getTargetTypeRefFromTypeAliasDeclarations(input, [
    input.semantics.getSymbolAtLocation(typeName, { sourceFile }),
    semanticType?.symbol,
  ], sourceNode, sourceFile);
  if (aliased !== undefined) {
    return aliased;
  }
  const direct = getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    getTargetTypeRefFromDirectFacts(input, typeName);
  if (direct?.kind === "source-primitive") {
    return direct;
  }
  const semanticDirect = getTargetTypeRefFromDirectFacts(input, semanticType) ??
    getTargetTypeRefFromDirectFacts(input, semanticType?.symbol);
  if (semanticDirect !== undefined) {
    return semanticDirect;
  }
  const binding = input.semantics.getTargetBindingForReference(sourceNode, { sourceFile });
  if (binding === undefined) {
    return direct;
  }
  const typeArguments = getNodeList(getNodeField(sourceNode, "TypeArguments"))
    .map((argument) => getTargetTypeRefForNode(input, argument, sourceFile));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-named",
    id: binding.id,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
}

function getTargetTypeRefFromTypeReferenceAlias(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (!HasSourceKind(input.ast, sourceNode, KindTypeReference)) {
    return undefined;
  }
  const typeName = asNode(getNodeField(sourceNode, "TypeName"));
  return typeName === undefined
    ? undefined
    : getTargetTypeRefFromTypeAliasDeclarations(
        input,
        [input.semantics.getSymbolAtLocation(typeName, { sourceFile })],
        sourceNode,
        sourceFile,
      );
}

function getTargetTypeRefFromTypeAliasDeclarations(
  input: TargetCompileInput,
  symbols: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  for (const symbol of symbols) {
    for (const declaration of getSymbolDeclarations(symbol)) {
      const typeNode = asNode(getNodeField(declaration, "Type"));
      if (typeNode === undefined || typeNode === currentNode) {
        continue;
      }
      const result = getTargetTypeRefForNode(input, typeNode, sourceFileOfNode(input, typeNode, sourceFile));
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function getNullableUnionTargetTypeRefFromSyntax(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const members = getNodeList(getNodeField(sourceNode, "Types"));
  const nonNullish = members.filter((member) => !isNullishTypeSyntax(input, member));
  if (nonNullish.length !== 1 || nonNullish.length === members.length) {
    return undefined;
  }
  const inner = getTargetTypeRefForNode(input, nonNullish[0], sourceFile);
  return inner === undefined ? undefined : { kind: "target-named", id: "System.Nullable`1", typeArguments: [inner] };
}

function isNullishTypeSyntax(input: TargetCompileInput, node: Node): boolean {
  const kind = input.ast.kindName(node);
  if (kind === "KindNullKeyword" || kind === "KindUndefinedKeyword") {
    return true;
  }
  const literal = asNode(getNodeField(node, "Literal"));
  const literalKind = input.ast.kindName(literal);
  if (literalKind === "KindNullKeyword" || literalKind === "KindUndefinedKeyword") {
    return true;
  }
  if (HasSourceKind(input.ast, node, KindTypeReference)) {
    return input.ast.text(asNode(getNodeField(node, "TypeName"))) === "undefined";
  }
  return false;
}

function getTargetTypeRefFromFunctionTypeSyntax(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const parameters = getNodeList(getNodeField(sourceNode, "Parameters"));
  if (parameters.length === 0) {
    return undefined;
  }
  const parameterTypes = parameters.map((parameter) => getTargetTypeRefForNode(input, asNode(getNodeField(parameter, "Type")), sourceFile));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForNode(input, asNode(getNodeField(sourceNode, "Type")), sourceFile);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameterTypes.length}`,
      typeArguments: parameterTypes as readonly TargetTypeRef[],
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameterTypes.length + 1}`,
    typeArguments: [...(parameterTypes as readonly TargetTypeRef[]), returnType],
  };
}

function getNodeList(value: unknown): readonly Node[] {
  const nodes = (value as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes;
  return nodes === undefined
    ? []
    : nodes.map(asNode).filter((node): node is Node => node !== undefined);
}

function getTargetTypeRefFromDeclarationAnnotation(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const symbol = input.semantics.getSymbolAtLocation(sourceNode, { sourceFile });
  const declarations = (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
  for (const declaration of declarations) {
    const typeNode = asNode(getNodeField(declaration, "Type"));
    if (typeNode !== undefined && typeNode !== sourceNode) {
      const result = getTargetTypeRefForNode(input, typeNode, sourceFileOfNode(input, typeNode, sourceFile));
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function getTypeParameterName(input: TargetCompileInput, type: Type): string | undefined {
  const declarations = (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  for (const declaration of declarations) {
    if (!input.ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const name = (declaration as { readonly name?: { readonly Text?: unknown }; readonly Name?: { readonly Text?: unknown } }).name ??
      (declaration as { readonly Name?: { readonly Text?: unknown } }).Name;
    const text = name?.Text;
    if (typeof text === "string" && text.length > 0) {
      return text;
    }
  }
  return undefined;
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  const record = node as unknown as Record<string, unknown>;
  const exact = record[field];
  if (exact !== undefined) {
    return exact;
  }
  const alternate = `${field[0]!.toLowerCase()}${field.slice(1)}`;
  return record[alternate];
}

function getSemanticTypeForNode(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): Type | undefined {
  return IsTypeSyntaxNode(input.ast, sourceNode)
    ? input.semantics.getTypeFromTypeNode(sourceNode, { sourceFile })
    : input.semantics.getTypeAtLocation(sourceNode, { sourceFile });
}

function getSymbolDeclarations(symbol: ExtensionFactSubject | undefined): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

function asNode(value: unknown): Node | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly Kind?: unknown }).Kind === "number"
    ? value as Node
    : undefined;
}

function isType(value: unknown): value is Type {
  return typeof value === "object" && value !== null && "flags" in value;
}

function isSourceLibraryType(
  input: TargetCompileInput,
  type: Type,
  name: string,
  sourceFile: SourceFile,
): boolean {
  const target = input.types.isTypeReference?.(type) === true ? input.types.getTypeReferenceTarget(type) : type;
  const declarations = (target?.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    [];
  return declarations.some((declaration) =>
    input.ast.text(input.ast.name(declaration)) === name &&
    input.ast.getFileName(input.ast.getSourceFile(declaration)).startsWith("bundled:///libs/")) ||
    (input.types.isArrayLike?.(type, { sourceFile }) === true && (name === "Array" || name === "ReadonlyArray"));
}

function getTargetTypeRefForProjectSourceType(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const declaration = (type.symbol as { readonly ValueDeclaration?: Node; readonly Declarations?: readonly Node[] } | undefined)?.ValueDeclaration ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations?.find((candidate) => candidate !== undefined);
  if (declaration === undefined) {
    return undefined;
  }
  const declarationFile = input.ast.getSourceFile(declaration);
  if (declarationFile === undefined ||
    declarationFile.IsDeclarationFile ||
    input.ast.getFileName(declarationFile).startsWith("bundled:///libs/") ||
    (declarationFile !== sourceFile && !input.sourceFiles.includes(declarationFile)) ||
    input.ast.kindName(declaration) === KindTypeLiteral) {
    return undefined;
  }
  const name = type.symbol?.Name;
  if (typeof name !== "string" || name.length === 0) {
    return undefined;
  }
  const typeArguments = input.types.isTypeReference?.(type) === true
    ? input.types.getTypeArguments(type, { sourceFile })
      .map((argument) => getTargetTypeRefForType(input, argument, sourceFile))
      .filter((argument): argument is TargetTypeRef => argument !== undefined)
    : [];
  return {
    kind: "target-specific",
    target: "csharp",
    name: "project-source-type",
    value: {
      name,
      ...(typeArguments.length > 0 ? { typeArguments } : {}),
    },
  };
}

function isVoidTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Void";
}

function sourceFileOfNode(
  input: TargetCompileInput,
  node: Node,
  fallback: SourceFile,
): SourceFile {
  return input.ast.getSourceFile(node) ?? fallback;
}
