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
import {
  csharpObjectShapeFactKey,
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
} from "./ast-utils.js";
import {
  getObjectShapeTargetName,
} from "./object-shape-identity.js";
import {
  getDeclarationTypeNode,
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import {
  isVoidTargetType,
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

export {
  getTargetTypeRefForSyntaxNode,
  recordCsharpSourceFileFacts,
} from "./object-shape-syntax-facts.js";

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
