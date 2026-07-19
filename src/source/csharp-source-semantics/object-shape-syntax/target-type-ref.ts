import {
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactStore,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
  getRecordedCsharpRuntimeCarrierFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
import {
  isVoidTargetType,
} from "../target-rules.js";
import {
  csharpBigIntegerTargetType,
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetTypeFromBinding,
  csharpVoidTargetType,
} from "../target-types.js";

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
  const direct = getRecordedCsharpRuntimeCarrierFact(facts, node)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  const primitive = facts.get(node, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const binding = facts.get(node, targetBindingFactKey);
  if (binding !== undefined) {
    return csharpTargetTypeFromBinding(binding);
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
  if (returnType === undefined) {
    return undefined;
  }
  if (isVoidTargetType(returnType)) {
    return csharpDelegateTargetType("System.Action", parameters as readonly TargetTypeRef[]);
  }
  return csharpDelegateTargetType("System.Func", parameters as readonly TargetTypeRef[], returnType);
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
      return csharpStringTargetType();
    case "KindBigIntKeyword":
      return csharpBigIntegerTargetType();
    case "KindVoidKeyword":
      return csharpVoidTargetType();
    default:
      return undefined;
  }
}
