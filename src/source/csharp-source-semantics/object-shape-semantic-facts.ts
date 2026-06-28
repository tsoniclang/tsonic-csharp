import {
  contextualTargetTypeFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
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
