import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "../../../operations-provider.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import {
  carrierRequirementsForArrayStructuralUses,
  collectArrayStructuralUsesForSymbol,
} from "./structural-uses.js";
import type {
  ArrayParameterAnalysis,
  ArrayLocalAnalysis,
  ArrayReturnAnalysis,
  CsharpArrayCarrierRequirement,
  LifecycleContext,
} from "./types.js";
import {
  isSourceStandardLibraryArrayLikeType,
} from "../../../source-type-classification.js";
import {
  getCsharpArrayLiteralElementTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpTaskResultTargetType,
} from "../../../target-types.js";

export function collectArrayParameters(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayParameterAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const parameters: ArrayParameterAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsParameterDeclaration(node)) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    if (typeNode === undefined) {
      return;
    }
    const arrayTypeNode = getSourceArrayTypeNodeFromDeclaredType(typeNode, sourceFile, context);
    if (arrayTypeNode === undefined) {
      return;
    }
    const name = asNodeSubject(getNodeField(node, "name"));
    if (name === undefined || (!compiler.ast.is.IsIdentifier(name) && compiler.ast.kindName(name) !== "KindArrayBindingPattern")) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(arrayTypeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    const nameIsIdentifier = compiler.ast.is.IsIdentifier(name);
    const symbol = nameIsIdentifier
      ? getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
        getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile)
      : undefined;
    const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(name, { sourceFile });
    const sourceUses = nameIsIdentifier
      ? collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext)
      : [];
    parameters.push({
      parameter: node,
      name,
      typeNode,
      symbol,
      semanticType,
      elementType,
      sourceUses,
      carrierRequirements: nameIsIdentifier
        ? carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host)
        : carrierRequirementsForArrayBindingPattern(name),
    });
  });
  return parameters;
}

function carrierRequirementsForArrayBindingPattern(pattern: Node): ReadonlySet<CsharpArrayCarrierRequirement> {
  const requirements = new Set<CsharpArrayCarrierRequirement>();
  for (const element of getNodeList(getNodeField(pattern, "Elements"))) {
    requirements.add("index-read");
    if (asNodeSubject(getNodeField(element, "Initializer")) !== undefined || asNodeSubject(getNodeField(element, "DotDotDotToken")) !== undefined) {
      requirements.add("length-read");
    }
  }
  return requirements;
}

export function collectArrayReturnTypeNodes(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayReturnAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const returns: ArrayReturnAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    const kind = compiler.ast.kindName(node);
    if (
      kind !== "KindFunctionDeclaration" &&
      kind !== "KindMethodDeclaration" &&
      kind !== "KindArrowFunction" &&
      kind !== "KindFunctionExpression"
    ) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    const semanticType = getDeclarationReturnSemanticType(node, sourceFile, lifecycleContext);
    const elementType = getArrayReturnElementType(typeNode, semanticType, sourceFile, context, host);
    if (elementType === undefined) {
      return;
    }
    returns.push({
      declaration: node,
      ...(typeNode === undefined ? {} : { typeNode }),
      ...(semanticType === undefined ? {} : { semanticType }),
      readonlySourceContract: isReadonlySourceArrayDeclaredType(typeNode, sourceFile, context),
      sourceReturnSubjects: getArrayReturnSourceSubjects(node, sourceFile, lifecycleContext),
      returnExpressions: getArrayReturnExpressionSubjects(node, lifecycleContext),
      elementType,
    });
  });
  return returns;
}

export function collectArrayLocalDeclarations(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayLocalAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const locals: ArrayLocalAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsVariableDeclaration(node)) {
      const bindingElement = collectArrayBindingElementLocal(node, sourceFile, lifecycleContext, context, host);
      if (bindingElement !== undefined) {
        locals.push(bindingElement);
      }
      return;
    }
    const initializer = asNodeSubject(getNodeField(node, "Initializer"));
    const name = asNodeSubject(getNodeField(node, "name"));
    if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
      return;
    }
    const semanticType = compiler.checker.getTypeAtLocation(name, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(initializer, { sourceFile });
    if (semanticType === undefined || !isSourceStandardLibraryArrayLikeType(semanticType, context)) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    const elementType = getArrayElementTypeFromLocalDeclaration(typeNode, semanticType, sourceFile, context, host);
    if (elementType === undefined) {
      return;
    }
    if (initializer !== undefined && initializerHasExplicitNativeArrayTarget(initializer, sourceFile, context, host)) {
      return;
    }
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
      getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
    const sourceUses = collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext);
    const carrierRequirements = new Set(carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host));
    if (initializer !== undefined && arrayLiteralHasElision(initializer, compiler.ast)) {
      carrierRequirements.add("full-js");
    }
    locals.push({
      declaration: node,
      name,
      ...(initializer === undefined ? {} : { initializer }),
      ...(typeNode === undefined ? {} : { typeNode }),
      symbol,
      semanticType,
      elementType,
      sourceUses,
      carrierRequirements,
    });
  });
  return locals;
}

function arrayLiteralHasElision(node: Node, ast: NonNullable<LifecycleContext["compiler"]>["ast"]): boolean {
  if (!ast.is.IsArrayLiteralExpression(node)) {
    return false;
  }
  return getNodeList(getNodeField(node, "Elements")).some((element) => ast.kindName(element) === "KindOmittedExpression");
}

function collectArrayBindingElementLocal(
  node: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): ArrayLocalAnalysis | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindBindingElement") {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(node, "name"));
  if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
    return undefined;
  }
  const semanticType = compiler.checker.getTypeAtLocation(name, { sourceFile });
  if (semanticType === undefined || !isSourceStandardLibraryArrayLikeType(semanticType, context)) {
    return undefined;
  }
  const targetType = host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  const elementType = targetType?.kind === "array"
    ? targetType.element
    : getCsharpArrayLiteralElementTargetType(targetType) ??
      getCsharpCollectionElementTargetType(targetType);
  if (elementType === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
    getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  const sourceUses = collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext);
  return {
    declaration: node,
    name,
    symbol,
    semanticType,
    elementType,
    sourceUses,
    carrierRequirements: carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host),
  };
}

function getArrayElementTypeFromLocalDeclaration(
  typeNode: ReturnType<typeof asNodeSubject>,
  semanticType: ReturnType<NonNullable<LifecycleContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
) {
  const compiler = context.compiler;
  const arrayTypeNode = getSourceArrayTypeNodeFromDeclaredType(typeNode, sourceFile, context);
  if (arrayTypeNode !== undefined && compiler !== undefined) {
    const elementTypeNode = asNodeSubject(getNodeField(arrayTypeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    return elementType;
  }
  const targetType = host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  return targetType?.kind === "array"
    ? targetType.element
    : getCsharpArrayLiteralElementTargetType(targetType) ??
      getCsharpCollectionElementTargetType(targetType);
}

function getArrayReturnElementType(
  typeNode: ReturnType<typeof asNodeSubject>,
  semanticType: Type | undefined,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): TargetTypeRef | undefined {
  const compiler = context.compiler;
  const arrayTypeNode = getSourceArrayTypeNodeFromDeclaredType(typeNode, sourceFile, context);
  if (arrayTypeNode !== undefined && compiler !== undefined) {
    return host.getTargetTypeRefForSubject(asNodeSubject(getNodeField(arrayTypeNode, "ElementType")), context, { allowSemanticTypeQuery: true, sourceFile });
  }
  if (semanticType === undefined || !isSourceStandardLibraryArrayLikeType(semanticType, context)) {
    return undefined;
  }
  const targetType = host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  return targetType?.kind === "array"
    ? targetType.element
    : getCsharpArrayLiteralElementTargetType(targetType) ??
      getCsharpCollectionElementTargetType(targetType);
}

function getDeclarationReturnSemanticType(
  declaration: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): Type | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const declarationType = compiler.checker.getTypeAtLocation(declaration, { sourceFile });
  const name = compiler.ast.name(declaration);
  const nameType = name === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(name, { sourceFile });
  const symbol = name === undefined
    ? undefined
    : compiler.checker.getSymbolAtLocation(name, { sourceFile });
  const resolvedSymbol = name === undefined
    ? undefined
    : compiler.checker.getResolvedSymbol(name, { sourceFile });
  const symbolType = symbol === undefined
    ? undefined
    : compiler.checker.getTypeOfSymbol(symbol, { sourceFile });
  const resolvedSymbolType = resolvedSymbol === undefined
    ? undefined
    : compiler.checker.getTypeOfSymbol(resolvedSymbol, { sourceFile });
  const signature = compiler.typeShape.getCallSignatures(declarationType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(nameType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(symbolType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(resolvedSymbolType, { sourceFile })[0];
  return signature === undefined
    ? undefined
    : compiler.typeShape.getReturnTypeOfSignature(signature, { sourceFile });
}

function getArrayReturnSourceSubjects(
  declaration: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): readonly ExtensionFactSubject[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [declaration];
  }
  const owner = getCallableOwnerDeclaration(declaration, compiler.ast);
  const declarationName = asNodeSubject(getNodeField(declaration, "name"));
  const ownerName = owner === undefined
    ? undefined
    : asNodeSubject(getNodeField(owner, "name"));
  const symbol =
    getSymbolForDeclarationLookup(compiler.ast, compiler.checker, declaration, sourceFile) ??
    getSymbolForOptionalDeclarationLookup(declarationName, sourceFile, lifecycleContext) ??
    getSymbolForOptionalDeclarationLookup(owner, sourceFile, lifecycleContext) ??
    getSymbolForOptionalDeclarationLookup(ownerName, sourceFile, lifecycleContext);
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    declaration,
    owner,
    declarationName,
    ownerName,
    symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function getArrayReturnExpressionSubjects(
  declaration: Node,
  lifecycleContext: LifecycleContext,
): readonly Node[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const ast = compiler.ast;
  const body = asNodeSubject(getNodeField(declaration, "Body"));
  const subjects: Node[] = [];
  if (body !== undefined && ast.kindName(body) !== "KindBlock") {
    subjects.push(body);
  }
  visitAstReaderNodes(ast, declaration, (node) => {
    if (ast.kindName(node) !== "KindReturnStatement" || getNearestFunctionLikeAncestor(node, ast) !== declaration) {
      return;
    }
    const expression = asNodeSubject(getNodeField(node, "Expression"));
    if (expression !== undefined) {
      subjects.push(expression);
    }
  });
  return Array.from(new Set(subjects));
}

function getNearestFunctionLikeAncestor(
  node: Node,
  ast: NonNullable<LifecycleContext["compiler"]>["ast"],
): Node | undefined {
  for (let parent = asNodeSubject(getNodeField(node, "Parent")); parent !== undefined; parent = asNodeSubject(getNodeField(parent, "Parent"))) {
    if (isFunctionLikeDeclaration(parent, ast)) {
      return parent;
    }
  }
  return undefined;
}

function isFunctionLikeDeclaration(
  node: Node,
  ast: NonNullable<LifecycleContext["compiler"]>["ast"],
): boolean {
  switch (ast.kindName(node)) {
    case "KindFunctionDeclaration":
    case "KindMethodDeclaration":
    case "KindArrowFunction":
    case "KindFunctionExpression":
    case "KindGetAccessor":
    case "KindSetAccessor":
    case "KindConstructor":
      return true;
    default:
      return false;
  }
}

function getSymbolForOptionalDeclarationLookup(
  node: Node | undefined,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): ReturnType<typeof getSymbolForDeclarationLookup> {
  const compiler = lifecycleContext.compiler;
  return compiler === undefined || node === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile);
}

function getCallableOwnerDeclaration(
  declaration: Node,
  ast: NonNullable<LifecycleContext["compiler"]>["ast"],
): Node | undefined {
  if (ast.kindName(declaration) !== "KindArrowFunction" && ast.kindName(declaration) !== "KindFunctionExpression") {
    return undefined;
  }
  const parent = asNodeSubject(getNodeField(declaration, "Parent"));
  return ast.kindName(parent) === "KindVariableDeclaration" ||
    ast.kindName(parent) === "KindPropertyAssignment" ||
    ast.kindName(parent) === "KindPropertyDeclaration"
    ? parent
    : undefined;
}

function getSourceArrayTypeNodeFromDeclaredType(
  typeNode: ReturnType<typeof asNodeSubject>,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
): Node | undefined {
  const compiler = context.compiler;
  if (typeNode === undefined || compiler === undefined) {
    return undefined;
  }
  if (compiler.ast.is.IsArrayTypeNode(typeNode)) {
    return typeNode;
  }
  if (!compiler.ast.is.IsTypeOperatorNode(typeNode)) {
    return undefined;
  }
  const innerTypeNode = asNodeSubject(getNodeField(typeNode, "Type"));
  if (innerTypeNode === undefined || !compiler.ast.is.IsArrayTypeNode(innerTypeNode)) {
    return undefined;
  }
  const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile });
  return semanticType !== undefined && isSourceStandardLibraryArrayLikeType(semanticType, context)
    ? innerTypeNode
    : undefined;
}

function isReadonlySourceArrayDeclaredType(
  typeNode: ReturnType<typeof asNodeSubject>,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
): boolean {
  const compiler = context.compiler;
  if (typeNode === undefined || compiler === undefined || !compiler.ast.is.IsTypeOperatorNode(typeNode)) {
    return false;
  }
  const innerTypeNode = asNodeSubject(getNodeField(typeNode, "Type"));
  if (innerTypeNode === undefined || !compiler.ast.is.IsArrayTypeNode(innerTypeNode)) {
    return false;
  }
  const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile });
  return semanticType !== undefined && isSourceStandardLibraryArrayLikeType(semanticType, context);
}

function initializerHasExplicitNativeArrayTarget(
  initializer: Node,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): boolean {
  const compiler = context.compiler;
  if (compiler?.ast.is.IsArrayLiteralExpression(initializer) === true) {
    return false;
  }
  const recordedCarrier = context.host.facts.get(initializer, runtimeCarrierFactKey)?.carrier ??
    context.host.factResolver.resolve(initializer, runtimeCarrierFactKey)?.carrier;
  if (recordedCarrier?.kind === "array") {
    return true;
  }
  const selectedReturn = context.host.facts.get(initializer, selectedTargetSignatureFactKey)?.member.returnType ??
    context.host.factResolver.resolve(initializer, selectedTargetSignatureFactKey)?.member.returnType;
  if (selectedReturn?.kind === "array") {
    return true;
  }
  const initializerKind = compiler?.ast.kindName(initializer);
  if (initializerKind === "KindCallExpression" || initializerKind === "KindNewExpression") {
    return false;
  }
  const targetType = host.getTargetTypeRefForSubject(initializer, context, {
    allowRuntimeCarrier: false,
    allowSemanticTypeQuery: false,
    sourceFile,
  });
  if (targetType?.kind === "array") {
    return true;
  }
  if (compiler?.ast.is.IsAwaitExpression(initializer) !== true) {
    return false;
  }
  const awaitedExpression = asNodeSubject(getNodeField(initializer, "Expression"));
  const awaitedType = host.getTargetTypeRefForSubject(awaitedExpression, context, {
    allowRuntimeCarrier: false,
    allowSemanticTypeQuery: false,
    sourceFile,
  });
  return getCsharpTaskResultTargetType(awaitedType)?.kind === "array";
}
