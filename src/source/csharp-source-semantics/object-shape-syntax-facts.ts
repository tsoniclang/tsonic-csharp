import {
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactStore,
  ExtensionObservationContext,
  Node,
  SourceFileBoundLifecycleRequest,
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  type CsharpTypeParameterConstraint,
  csharpObjectShapeFactKey,
  csharpTargetTypeParameterConstraintFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  getNodeNameText,
  visitAstReaderNodes,
  visitStructuralNodes,
} from "./ast-utils.js";
import {
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpTargetTypeFromBinding,
} from "./target-types.js";
import {
  isVoidTargetType,
  sourcePrimitiveRuntimeKind,
} from "./target-rules.js";

export function recordCsharpTypeParameterConstraintFacts(
  request: SourceFileBoundLifecycleRequest,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  const sourceFile = asNodeSubject(request.sourceFile);
  if (sourceFile === undefined || request.providerVirtualModule !== undefined) {
    return;
  }
  const visitNodes = ast === undefined
    ? visitStructuralNodes
    : (node: Node, visitor: (node: Node) => void) => visitAstReaderNodes(ast, node, visitor);
  visitNodes(sourceFile, (node) => {
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
  const typeParameterName = getNodeNameText(node);
  const constraint = getCsharpTypeParameterConstraintForPrimitive(constraintType.name, typeParameterName);
  if (constraint === undefined) {
    return;
  }
  facts.set(node, csharpTargetTypeParameterConstraintFactKey, {
    constraints: [constraint],
  }, [{ message: "C# type-parameter constraint fact recorded from source primitive constraint." }]);
}

function getCsharpTypeParameterConstraintForPrimitive(
  kind: SourcePrimitiveKind,
  typeParameterName: string,
): CsharpTypeParameterConstraint | undefined {
  return sourcePrimitiveRuntimeKind(kind) === "number" || sourcePrimitiveRuntimeKind(kind) === "bigint"
    ? {
        kind: "csharp-type",
        type: csharpTargetNamedType("System.Numerics.INumber`1", [{ kind: "type-parameter", name: typeParameterName }]),
      }
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
      return csharpTargetNamedType("System.String");
    case "KindBigIntKeyword":
      return csharpTargetNamedType("System.Numerics.BigInteger");
    case "KindVoidKeyword":
      return csharpTargetNamedType("System.Void");
    default:
      return undefined;
  }
}
