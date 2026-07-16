import {
  contextualTargetTypeFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  createObjectShapeTargetType,
} from "./object-shape-identity.js";
import {
  sourceStandardLibraryTypeIsObjectShapeExcluded,
} from "./source-type-classification.js";
import {
  asType,
  generatedObjectShapeMemberName,
} from "./target-ref-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";
import {
  isClassObjectInitializerConstructible,
} from "./object-shape-semantic/class-constructible.js";
import {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic/declaration-shape.js";
import {
  deriveCsharpObjectShapeMembersForSemanticType,
} from "./object-shape-semantic/member-facts.js";
import {
  getSemanticTypeForObjectShapeSubject,
} from "./object-shape-semantic/subject-type.js";
import {
  substituteCsharpObjectShapeMemberTypeParameters,
} from "./object-shape-semantic/type-parameter-substitution.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./target-types.js";

export {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic/declaration-shape.js";

export function deriveCsharpObjectShapeFactForSemanticSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolver?: CsharpRecursiveTargetTypeResolver,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const node = asNodeSubject(subject);
  const sourceFile = node === undefined ? undefined : compiler.ast.getSourceFile(node);
  if (node !== undefined && objectShapeRuntimeNodeIsFunctionLike(node, compiler.ast)) {
    return undefined;
  }
  const semanticType = asType(subject) ??
    getSemanticTypeForObjectShapeSubject(node, context, sourceFile);
  if (semanticType === undefined ||
    compiler.typeShape.isAny(semanticType) ||
    compiler.typeShape.isUnknown(semanticType) ||
    compiler.typeShape.isStringLike(semanticType) ||
    compiler.typeShape.isNumberLike(semanticType) ||
    compiler.typeShape.isBooleanLike(semanticType) ||
    compiler.typeShape.isBigIntLike(semanticType) ||
    (compiler.typeShape.isTypeReference(semanticType) && compiler.typeShape.isTuple(semanticType)) ||
    sourceStandardLibraryTypeIsObjectShapeExcluded(semanticType, context) ||
    compiler.typeShape.isUnion(semanticType)) {
    return undefined;
  }
  const rawContextualTargetType = asType(node === undefined ? undefined : context.facts.get(node, contextualTargetTypeFactKey)?.type);
  const contextualTargetType = getSingleNonNullishContextualType(rawContextualTargetType, compiler.typeShape) ?? rawContextualTargetType;
  const isObjectLiteral = node !== undefined && compiler.ast.is.IsObjectLiteralExpression(node);
  const convertedTargetType = isObjectLiteral
    ? context.facts.get(node, targetConversionFactKey)?.convertedType ??
      context.factResolver.resolve(node, targetConversionFactKey)?.convertedType
    : undefined;
  const convertedObjectShape = convertedTargetType === undefined
    ? undefined
    : context.facts.get(convertedTargetType, csharpObjectShapeFactKey) ??
      context.factResolver.resolve(convertedTargetType, csharpObjectShapeFactKey);
  const declaredShape = getSemanticTypeDeclarationShape(contextualTargetType ?? semanticType, context, host, resolver);
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
    const members = deriveCsharpObjectShapeMembersForSemanticType(classType, context, sourceFile, host, "property", resolver);
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
    const interfaceMembers = deriveCsharpObjectShapeMembersForSemanticType(semanticType, context, sourceFile, host, "callable-property-as-method", resolver);
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
  const convertedInterfaceShape = convertedObjectShape !== undefined && sourceDeclaredInterfaceTargetType(convertedObjectShape.targetType)
    ? convertedObjectShape
    : undefined;
  const interfaceTargetType = convertedInterfaceShape?.targetType ??
    (declaredShape?.kind === "interface" ? declaredShape.targetType : undefined);
  const memberSourceType = interfaceTargetType !== undefined && isObjectLiteral && contextualTargetType !== undefined
    ? contextualTargetType
    : semanticType;
  const members = convertedInterfaceShape?.members ??
    deriveCsharpObjectShapeMembersForSemanticType(memberSourceType, context, sourceFile, host, "callable-property-as-method", resolver);
  const resolvedMembers = members === undefined
    ? undefined
    : convertedInterfaceShape !== undefined
      ? members
      : substituteCsharpObjectShapeMemberTypeParameters(members, memberSourceType, interfaceTargetType ?? declaredShape?.targetType, context);
  if (resolvedMembers === undefined) {
    return undefined;
  }
  const implementsTypes = interfaceTargetType !== undefined
    ? [interfaceTargetType]
    : undefined;
  const shapeNamePrefix = interfaceTargetType !== undefined
    ? `__TsonicShape_${generatedObjectShapeMemberName(sourceDeclaredTargetTypeName(interfaceTargetType))}`
    : "__TsonicShape";
  return {
    targetType: createObjectShapeTargetType(shapeNamePrefix, resolvedMembers, implementsTypes),
    members: resolvedMembers,
    ...(implementsTypes === undefined ? {} : { implements: implementsTypes }),
  };
}

function sourceDeclaredInterfaceTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "interface";
}

function sourceDeclaredTargetTypeName(type: TargetTypeRef): string {
  if (type.kind !== "target-named") {
    return "Contract";
  }
  const render = (type as CsharpTargetNamedTypeRef).csharpRender;
  return render?.kind === "named" ? render.name : type.id;
}

function getSingleNonNullishContextualType(
  type: Type | undefined,
  typeShape: NonNullable<ExtensionObservationContext["compiler"]>["typeShape"],
): Type | undefined {
  if (type === undefined || !typeShape.isUnion(type)) {
    return undefined;
  }
  const members = typeShape.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined && !typeShape.isNullish(member));
  return members.length === 1 ? members[0] : undefined;
}

function objectShapeRuntimeNodeIsFunctionLike(
  node: NonNullable<ReturnType<typeof asNodeSubject>>,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  return ast.is.IsFunctionDeclaration(node) ||
    ast.is.IsFunctionExpression(node) ||
    ast.is.IsArrowFunction(node) ||
    ast.is.IsMethodDeclaration(node);
}
