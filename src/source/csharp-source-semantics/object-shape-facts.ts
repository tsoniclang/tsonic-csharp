import {
  contextualTargetTypeFactKey,
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFileBoundLifecycleRequest,
  SourcePrimitiveKind,
  Symbol,
  TargetConstraint,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
  csharpTargetTypeParameterConstraintFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  getNodeNameText,
  isTypeLiteralLikeNode,
  visitStructuralNodes,
} from "./ast-utils.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  getObjectShapeTargetName,
} from "./object-shape-identity.js";
import {
  getDeclarationTypeNode,
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  isVoidTargetType,
  sourcePrimitiveRuntimeKind,
} from "./target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asType,
  sourceNameToCsharpMemberName,
} from "./target-ref-utils.js";
import type {
  CsharpSemanticTypeDeclarationShape,
} from "./target-type-resolution.js";

export interface CsharpObjectShapeSemanticsHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getFunctionTargetTypeRefFromSignatureLikeSubject: (
    node: Node,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeArgumentsForType: (
    type: Type,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => readonly TargetTypeRef[];
}

export function recordCsharpSourceFileFacts(
  request: SourceFileBoundLifecycleRequest,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  const sourceFile = asNodeSubject(request.sourceFile);
  if (sourceFile === undefined || request.providerVirtualModule !== undefined) {
    return;
  }
  visitStructuralNodes(sourceFile, (node) => {
    recordCsharpObjectShapeFact(node, facts, ast);
    recordCsharpTypeParameterConstraintFact(node, facts, ast);
  });
}

export function getTargetTypeRefForSyntaxNode(
  node: Node | undefined,
  facts: ExtensionFactStore,
  ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  const keyword = ast === undefined ? undefined : getTargetTypeRefFromKeywordTypeSyntax(ast, node);
  if (keyword !== undefined) {
    return keyword;
  }
  const direct = facts.get(node, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  const primitive = facts.get(node, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const binding = facts.get(node, targetBindingFactKey);
  if (binding !== undefined) {
    return csharpTargetNamedType(binding.id);
  }
  const objectShape = facts.get(node, csharpObjectShapeFactKey);
  if (objectShape !== undefined) {
    return objectShape.targetType;
  }
  const elementTypeNode = asNodeSubject(getNodeField(node, "ElementType"));
  if (elementTypeNode !== undefined) {
    const elementType = getTargetTypeRefForSyntaxNode(elementTypeNode, facts, ast);
    if (elementType === undefined) {
      return undefined;
    }
    return { kind: "array", element: elementType };
  }
  if (getNodeList(getNodeField(node, "Parameters")).length > 0) {
    return getFunctionTargetTypeRefFromSignatureLikeNode(node, facts, ast);
  }
  return undefined;
}

export function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (recorded !== undefined) {
    return recorded;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context, host);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context, host);
}

export function getRecordedCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const direct = context.facts.get(subject, csharpObjectShapeFactKey);
  if (direct !== undefined) {
    return direct;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  const declarationFact = declarationType === undefined ? undefined : context.facts.get(declarationType, csharpObjectShapeFactKey);
  if (declarationFact !== undefined) {
    return declarationFact;
  }
  return undefined;
}

export function getSemanticTypeDeclarationShape(
  type: Type,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpSemanticTypeDeclarationShape | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const declarations = getSymbolDeclarations(type.symbol);
  for (const declaration of declarations) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    const name = getNodeNameText(declaration);
    if (name.length === 0) {
      continue;
    }
    const targetTypeArguments = host.getTargetTypeArgumentsForType(type, context, {});
    const targetType = csharpTargetNamedType(name, targetTypeArguments);
    if (kind === "KindClassDeclaration") {
      return { kind: "class", name, targetType };
    }
    if (kind === "KindInterfaceDeclaration") {
      return { kind: "interface", name, targetType };
    }
    return { kind: "enum", name, targetType };
  }
  return undefined;
}

function recordCsharpObjectShapeFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  if (!isTypeLiteralLikeNode(node)) {
    return;
  }
  const members = getNodeList(getNodeField(node, "Members"));
  if (members.length === 0) {
    return;
  }
  const shapeMembers = members
    .map((member) => member === undefined ? undefined : getCsharpObjectShapeMemberFact(member, facts, ast))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return;
  }
  const fact = {
    targetType: csharpTargetNamedType(getObjectShapeTargetName("__TsonicShape", shapeMembers)),
    members: shapeMembers,
  } satisfies CsharpObjectShapeFact;
  facts.set(node, csharpObjectShapeFactKey, fact, [{ message: "C# object-shape fact recorded from structural type literal." }]);
}

function getCsharpObjectShapeMemberFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = getNodeNameText(node);
  if (sourceName.length === 0) {
    return undefined;
  }
  const memberKind = getNodeList(getNodeField(node, "Parameters")).length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? getFunctionTargetTypeRefFromSignatureLikeNode(node, facts, ast)
    : getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(node, "Type") ?? getNodeField(node, "type")), facts, ast);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
    ...(getNodeField(node, "QuestionToken") !== undefined ? { optional: true } : {}),
  };
}

function recordCsharpTypeParameterConstraintFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  const constraintNode = asNodeSubject(getNodeField(node, "Constraint"));
  if (constraintNode === undefined || getNodeNameText(node).length === 0) {
    return;
  }
  const constraintType = getTargetTypeRefForSyntaxNode(constraintNode, facts, ast);
  if (constraintType?.kind !== "source-primitive") {
    return;
  }
  const constraint = getCsharpTypeParameterConstraintForPrimitive(constraintType.name);
  if (constraint === undefined) {
    return;
  }
  facts.set(node, csharpTargetTypeParameterConstraintFactKey, {
    constraints: [constraint],
  }, [{ message: "C# type-parameter constraint fact recorded from source primitive constraint." }]);
}

function getCsharpTypeParameterConstraintForPrimitive(kind: SourcePrimitiveKind): TargetConstraint | undefined {
  return sourcePrimitiveRuntimeKind(kind) === "number" || sourcePrimitiveRuntimeKind(kind) === "bigint"
    ? { kind: "target-specific", target: csharpTargetId, name: "generic-math-number" }
    : undefined;
}

function getFunctionTargetTypeRefFromSignatureLikeNode(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): TargetTypeRef | undefined {
  const parameters = getNodeList(getNodeField(node, "Parameters"))
    .map((parameter) => getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(parameter, "Type")), facts, ast));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(node, "Type")), facts, ast);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameters.length}`, parameters as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameters.length + 1}`, [...(parameters as readonly TargetTypeRef[]), returnType]);
}

function getTargetTypeRefFromKeywordTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  switch (ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpTargetNamedType("System.String");
    case "KindBigIntKeyword":
      return csharpTargetNamedType("System.Numerics.BigInteger");
    case "KindVoidKeyword":
      return csharpTargetNamedType("System.Void");
    default:
      return undefined;
  }
}

function deriveCsharpObjectShapeFactForSemanticSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const node = asNodeSubject(subject);
  const sourceFile = node === undefined ? undefined : compiler.ast.getSourceFile(node);
  const semanticType = asType(subject) ??
    (node === undefined ? undefined : compiler.checker.getTypeAtLocation(node, { sourceFile }));
  if (semanticType === undefined ||
    compiler.types.isAny(semanticType) ||
    compiler.types.isUnknown(semanticType) ||
    compiler.types.isStringLike(semanticType) ||
    compiler.types.isNumberLike(semanticType) ||
    compiler.types.isBooleanLike(semanticType) ||
    compiler.types.isBigIntLike(semanticType) ||
    compiler.types.isArrayLike(semanticType, { sourceFile }) ||
    compiler.types.isUnion(semanticType)) {
    return undefined;
  }
  const contextualTargetType = asType(node === undefined ? undefined : context.facts.get(node, contextualTargetTypeFactKey)?.type);
  const declaredShape = getSemanticTypeDeclarationShape(contextualTargetType ?? semanticType, context, host);
  if (declaredShape?.kind === "class" || declaredShape?.kind === "enum") {
    return undefined;
  }
  if (declaredShape?.kind === "interface" &&
    (node === undefined || (!compiler.ast.is.IsObjectLiteralExpression(node) && compiler.ast.kindName(node) !== "KindObjectLiteralExpression"))) {
    return undefined;
  }
  const properties = compiler.types.getProperties(semanticType, { sourceFile })
    .filter((property): property is Symbol => property !== undefined);
  if (properties.length === 0) {
    return undefined;
  }
  const members = properties
    .map((property) => deriveCsharpObjectShapeMemberFactForSemanticProperty(semanticType, property, context, sourceFile, host))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (members.length !== properties.length) {
    return undefined;
  }
  const implementsTypes = declaredShape?.kind === "interface"
    ? [declaredShape.targetType]
    : undefined;
  const shapeNamePrefix = declaredShape?.kind === "interface"
    ? `__TsonicShape_${sourceNameToCsharpMemberName(declaredShape.name)}`
    : "__TsonicShape";
  return {
    targetType: csharpTargetNamedType(getObjectShapeTargetName(shapeNamePrefix, members, implementsTypes)),
    members,
    ...(implementsTypes === undefined ? {} : { implements: implementsTypes }),
  };
}

function deriveCsharpObjectShapeMemberFactForSemanticProperty(
  ownerType: Type,
  property: Symbol,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = property.Name;
  if (sourceName.length === 0 || context.compiler === undefined) {
    return undefined;
  }
  const propertyType = context.compiler.types.getPropertyType(ownerType, sourceName, { sourceFile });
  const signatures = context.compiler.types.getCallSignatures(propertyType, { sourceFile });
  const memberKind = signatures.length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? getFunctionTargetTypeRefFromSemanticSignature(signatures[0], context, sourceFile, host)
    : host.getTargetTypeRefForType(propertyType, context);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
  };
}

function getFunctionTargetTypeRefFromSemanticSignature(
  signature: unknown,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
  host: CsharpObjectShapeSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = context.compiler;
  if (compiler === undefined || signature === undefined) {
    return undefined;
  }
  const parameterTypes = ((signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [])
    .map((parameter) => host.getTargetTypeRefForType(compiler.checker.getTypeOfSymbol(parameter, { sourceFile }), context));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = host.getTargetTypeRefForType(compiler.types.getReturnTypeOfSignature(signature as Parameters<typeof compiler.types.getReturnTypeOfSignature>[0], { sourceFile }), context);
  return returnType === undefined || isVoidTargetType(returnType)
    ? csharpTargetNamedType(`System.Action\`${parameterTypes.length}`, parameterTypes as readonly TargetTypeRef[])
    : csharpTargetNamedType(`System.Func\`${parameterTypes.length + 1}`, [...(parameterTypes as readonly TargetTypeRef[]), returnType]);
}

function deriveCsharpObjectShapeFactForSubject(
  node: Node | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  if (node === undefined || !isTypeLiteralLikeNode(node)) {
    return undefined;
  }
  const members = getNodeList(getNodeField(node, "Members"));
  if (members.length === 0) {
    return undefined;
  }
  const shapeMembers = members
    .map((member) => deriveCsharpObjectShapeMemberFactForSubject(member, context, host))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return undefined;
  }
  return {
    targetType: csharpTargetNamedType(getObjectShapeTargetName("__TsonicShape", shapeMembers)),
    members: shapeMembers,
  };
}

function deriveCsharpObjectShapeMemberFactForSubject(
  member: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = getNodeNameText(member);
  if (sourceName.length === 0) {
    return undefined;
  }
  const memberKind = getNodeList(getNodeField(member, "Parameters")).length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? host.getFunctionTargetTypeRefFromSignatureLikeSubject(member, context, {})
    : host.getTargetTypeRefForSubject(asNodeSubject(getNodeField(member, "Type") ?? getNodeField(member, "type")), context);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
    ...(getNodeField(member, "QuestionToken") !== undefined ? { optional: true } : {}),
  };
}
