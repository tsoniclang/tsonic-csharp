import {
  contextualTargetTypeFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeNameText,
} from "./ast-utils.js";
import {
  getObjectShapeTargetName,
} from "./object-shape-identity.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import {
  asType,
  sourceNameToCsharpMemberName,
} from "./target-ref-utils.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import type {
  CsharpSemanticTypeDeclarationShape,
} from "./target-type-resolution.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";

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
    if (targetTypeArguments === undefined) {
      return undefined;
    }
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
