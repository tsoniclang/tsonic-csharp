import {
  contextualTargetTypeFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  createObjectShapeTargetType,
} from "./object-shape-identity.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import {
  sourceStandardLibraryTypeIsObjectShapeExcluded,
} from "./source-type-classification.js";
import {
  asType,
  generatedObjectShapeMemberName,
} from "./target-ref-utils.js";
import {
  csharpDelegateTargetType,
} from "./target-types.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic/declaration-shape.js";
import {
  substituteCsharpObjectShapeMemberTypeParameters,
} from "./object-shape-semantic/type-parameter-substitution.js";

export {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic/declaration-shape.js";

export function deriveCsharpObjectShapeFactForSemanticSubject(
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
    getSemanticTypeForObjectShapeSubject(node, context, sourceFile);
  if (semanticType === undefined ||
    compiler.types.isAny(semanticType) ||
    compiler.types.isUnknown(semanticType) ||
    compiler.types.isStringLike(semanticType) ||
    compiler.types.isNumberLike(semanticType) ||
    compiler.types.isBooleanLike(semanticType) ||
    compiler.types.isBigIntLike(semanticType) ||
    compiler.types.isTuple(semanticType) ||
    sourceStandardLibraryTypeIsObjectShapeExcluded(semanticType, context) ||
    compiler.types.isUnion(semanticType)) {
    return undefined;
  }
  const contextualTargetType = asType(node === undefined ? undefined : context.facts.get(node, contextualTargetTypeFactKey)?.type);
  const declaredShape = getSemanticTypeDeclarationShape(contextualTargetType ?? semanticType, context, host);
  const isObjectLiteral = node !== undefined && compiler.ast.is.IsObjectLiteralExpression(node);
  const contextualObjectShape = isObjectLiteral && contextualTargetType !== undefined
    ? context.facts.get(contextualTargetType, csharpObjectShapeFactKey)
    : undefined;
  if (contextualObjectShape !== undefined && declaredShape?.kind !== "interface") {
    return contextualObjectShape;
  }
  if (declaredShape?.kind === "class") {
    if (!isObjectLiteral) {
      return undefined;
    }
    const classType = contextualTargetType ?? semanticType;
    const members = deriveCsharpObjectShapeMembersForSemanticType(classType, context, sourceFile, host, "property");
    return members === undefined
      ? undefined
      : {
          targetType: declaredShape.targetType,
          members,
          constructible: isClassObjectInitializerConstructible(classType, context),
        };
  }
  if (declaredShape?.kind === "enum") {
    return undefined;
  }
  if (declaredShape?.kind === "interface" &&
    (node === undefined || (!compiler.ast.is.IsObjectLiteralExpression(node) && compiler.ast.kindName(node) !== "KindObjectLiteralExpression"))) {
    const interfaceMembers = deriveCsharpObjectShapeMembersForSemanticType(semanticType, context, sourceFile, host, "callable-property-as-method");
    const resolvedInterfaceMembers = interfaceMembers === undefined
      ? undefined
      : substituteCsharpObjectShapeMemberTypeParameters(interfaceMembers, semanticType, declaredShape.targetType, context);
    return resolvedInterfaceMembers === undefined
      ? undefined
      : {
          targetType: declaredShape.targetType,
          members: resolvedInterfaceMembers,
        };
  }
  const memberSourceType = declaredShape?.kind === "interface" && isObjectLiteral && contextualTargetType !== undefined
    ? contextualTargetType
    : semanticType;
  const members = deriveCsharpObjectShapeMembersForSemanticType(memberSourceType, context, sourceFile, host, "callable-property-as-method");
  const resolvedMembers = members === undefined
    ? undefined
    : substituteCsharpObjectShapeMemberTypeParameters(members, memberSourceType, declaredShape?.targetType, context);
  if (resolvedMembers === undefined) {
    return undefined;
  }
  const implementsTypes = declaredShape?.kind === "interface"
    ? [declaredShape.targetType]
    : undefined;
  const shapeNamePrefix = declaredShape?.kind === "interface"
    ? `__TsonicShape_${generatedObjectShapeMemberName(declaredShape.name)}`
    : "__TsonicShape";
  return {
    targetType: createObjectShapeTargetType(shapeNamePrefix, resolvedMembers, implementsTypes),
    members: resolvedMembers,
    ...(implementsTypes === undefined ? {} : { implements: implementsTypes }),
  };
}

function deriveCsharpObjectShapeMembersForSemanticType(
  type: Type,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
  host: CsharpObjectShapeSemanticsHost,
  callableMemberMode: "property" | "callable-property-as-method",
): readonly CsharpObjectShapeMemberFact[] | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const properties = compiler.types.getProperties(type, { sourceFile })
    .filter((property): property is Symbol => property !== undefined);
  if (properties.length === 0) {
    return undefined;
  }
  const members = properties
    .map((property) => deriveCsharpObjectShapeMemberFactForSemanticProperty(type, property, context, sourceFile, host, callableMemberMode))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  return members.length === properties.length ? members : undefined;
}

function isClassObjectInitializerConstructible(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  const classDeclarations = getSymbolDeclarations(type.symbol)
    .filter((declaration) => ast.kindName(declaration) === "KindClassDeclaration");
  if (classDeclarations.length === 0) {
    return false;
  }
  return classDeclarations.some((declaration) => {
    const constructors = getNodeList(getNodeField(declaration, "Members"))
      .filter((member) => ast.kindName(member) === "KindConstructor");
    return constructors.length === 0 ||
      constructors.some(constructorAllowsParameterlessCall);
  });
}

function constructorAllowsParameterlessCall(
  constructorDeclaration: Node,
): boolean {
  return getNodeList(getNodeField(constructorDeclaration, "Parameters"))
    .every(parameterAllowsOmission);
}

function parameterAllowsOmission(
  parameter: Node,
): boolean {
  return getNodeField(parameter, "Initializer") !== undefined ||
    getNodeField(parameter, "QuestionToken") !== undefined;
}

function getSemanticTypeForObjectShapeSubject(
  node: ReturnType<typeof asNodeSubject>,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Type | undefined {
  const compiler = context.compiler;
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  if (isControlFlowLabelIdentifier(compiler.ast, node)) {
    return undefined;
  }
  try {
    if (isTypeSyntaxNode(compiler.ast, node)) {
      return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
    }
    return isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
      ? compiler.checker.getTypeAtLocation(node, { sourceFile })
      : undefined;
  } catch {
    return undefined;
  }
}

function deriveCsharpObjectShapeMemberFactForSemanticProperty(
  ownerType: Type,
  property: Symbol,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
  host: CsharpObjectShapeSemanticsHost,
  callableMemberMode: "property" | "callable-property-as-method",
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = property.Name;
  if (sourceName.length === 0 || context.compiler === undefined) {
    return undefined;
  }
  const propertyType = context.compiler.types.getPropertyType(ownerType, sourceName, { sourceFile });
  const signatures = context.compiler.types.getCallSignatures(propertyType, { sourceFile });
  const memberKind = callableMemberMode === "callable-property-as-method" &&
    signatures.length > 0 &&
    isMethodLikeObjectShapeProperty(property, context)
    ? "method"
    : "property";
  const type = memberKind === "method"
    ? getExplicitMethodTargetTypeRef(property, context, host) ??
      getFunctionTargetTypeRefFromSemanticSignature(signatures[0], context, sourceFile, host)
    : getExplicitPropertyTargetTypeRef(property, context, host) ??
      host.getTargetTypeRefForType(propertyType, context);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: generatedObjectShapeMemberName(sourceName),
    memberKind,
    type,
  };
}

function getExplicitMethodTargetTypeRef(
  property: Symbol,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  for (const declaration of getSymbolDeclarations(property)) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindMethodSignature" && kind !== "KindMethodDeclaration") {
      continue;
    }
    const targetType = host.getFunctionTargetTypeRefFromSignatureLikeSubject(declaration, context, {});
    if (targetType !== undefined) {
      return targetType;
    }
  }
  return undefined;
}

function getExplicitPropertyTargetTypeRef(
  property: Symbol,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): TargetTypeRef | undefined {
  for (const declaration of getSymbolDeclarations(property)) {
    const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
    if (typeNode === undefined) {
      continue;
    }
    const targetType = host.getTargetTypeRefForSubject(typeNode, context, {});
    if (targetType !== undefined) {
      return targetType;
    }
  }
  return undefined;
}

function isMethodLikeObjectShapeProperty(
  property: Symbol,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  return getSymbolDeclarations(property).some((declaration) => {
    const kind = ast.kindName(declaration);
    return kind === "KindMethodSignature" || kind === "KindMethodDeclaration";
  });
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
    ? csharpDelegateTargetType("System.Action", parameterTypes as readonly TargetTypeRef[])
    : csharpDelegateTargetType("System.Func", parameterTypes as readonly TargetTypeRef[], returnType);
}
