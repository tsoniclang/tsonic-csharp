import type {
  ExtensionObservationContext,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeMemberFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  isVoidTargetType,
} from "../target-rules.js";
import {
  generatedObjectShapeMemberName,
} from "../target-ref-utils.js";
import {
  csharpNullableTargetType,
  csharpDelegateTargetType,
} from "../target-types.js";

export function deriveCsharpObjectShapeMembersForSemanticType(
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
  const properties = compiler.typeShape.getProperties(type, { sourceFile })
    .filter((property): property is Symbol => property !== undefined);
  if (properties.length === 0) {
    return undefined;
  }
  const members = properties
    .map((property) => deriveCsharpObjectShapeMemberFactForSemanticProperty(type, property, context, sourceFile, host, callableMemberMode))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  return members.length === properties.length ? members : undefined;
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
  const propertyType = context.compiler.typeShape.getPropertyType(ownerType, sourceName, { sourceFile });
  const signatures = context.compiler.typeShape.getCallSignatures(propertyType, { sourceFile });
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
  const optional = propertyHasOptionalDeclaration(property, context) ||
    propertyTypeIncludesNullish(propertyType, context);
  return {
    sourceName,
    targetName: generatedObjectShapeMemberName(sourceName),
    memberKind,
    type: optional ? csharpNullableTargetType(type) : type,
    ...(optional ? { optional: true } : {}),
  };
}

function propertyHasOptionalDeclaration(
  property: Symbol,
  context: ExtensionObservationContext,
): boolean {
  return getSymbolDeclarations(property, context.compiler?.checker)
    .some((declaration) => getNodeField(declaration, "QuestionToken") !== undefined);
}

function propertyTypeIncludesNullish(
  propertyType: Type | undefined,
  context: ExtensionObservationContext,
): boolean {
  const typeShape = context.compiler?.typeShape;
  if (propertyType === undefined || typeShape === undefined) {
    return false;
  }
  if (typeShape.isNullish(propertyType)) {
    return true;
  }
  return typeShape.isUnion(propertyType) &&
    typeShape.getUnionOrIntersectionTypes(propertyType).some((member) =>
      member !== undefined && typeShape.isNullish(member));
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
  for (const declaration of getSymbolDeclarations(property, context.compiler?.checker)) {
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
  for (const declaration of getSymbolDeclarations(property, context.compiler?.checker)) {
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
  return getSymbolDeclarations(property, context.compiler?.checker).some((declaration) => {
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
  const parameterTypes = compiler.checker.getSignatureParameters(signature as Parameters<typeof compiler.checker.getSignatureParameters>[0])
    .map((parameter) => {
      const parameterType = safeGetTypeOfSymbol(parameter, context, sourceFile);
      return parameterType === undefined
        ? undefined
        : host.getTargetTypeRefForType(parameterType, context);
    });
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = host.getTargetTypeRefForType(compiler.typeShape.getReturnTypeOfSignature(signature as Parameters<typeof compiler.typeShape.getReturnTypeOfSignature>[0], { sourceFile }), context);
  if (returnType === undefined) {
    return undefined;
  }
  return isVoidTargetType(returnType)
    ? csharpDelegateTargetType("System.Action", parameterTypes as readonly TargetTypeRef[])
    : csharpDelegateTargetType("System.Func", parameterTypes as readonly TargetTypeRef[], returnType);
}

function safeGetTypeOfSymbol(
  symbol: Parameters<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeOfSymbol"]>[0],
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Type | undefined {
  return context.compiler?.checker.getTypeOfSymbol(symbol, { sourceFile });
}
