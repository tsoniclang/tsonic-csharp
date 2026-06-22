import {
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactStore,
  ExtensionObservationContext,
  Node,
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
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";

export function recordCsharpTypeParameterConstraintFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: "type.resolveRuntimeCarrier",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpTypeParameterConstraintFact(node, context, host);
    });
  }
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
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): void {
  const ast = context.compiler?.ast;
  const constraintNode = asNodeSubject(getNodeField(node, "Constraint"));
  if (ast === undefined || constraintNode === undefined || getNodeNameText(node).length === 0 || ast.kindName(node) !== "KindTypeParameter") {
    return;
  }
  const constraints = getCsharpTypeParameterConstraintsForSyntaxNode(constraintNode, getNodeNameText(node), context, host);
  if (constraints.length === 0) {
    return;
  }
  context.facts.set(node, csharpTargetTypeParameterConstraintFactKey, {
    constraints,
  }, [{ message: "C# type-parameter constraint fact recorded from finalized source/provider constraint semantics." }]);
}

function getCsharpTypeParameterConstraintsForSyntaxNode(
  node: Node,
  typeParameterName: string,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): readonly CsharpTypeParameterConstraint[] {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return [];
  }
  if (ast.kindName(node) === "KindObjectKeyword") {
    return [{ kind: "csharp-keyword", keyword: "class" }];
  }
  if (ast.is.IsParenthesizedTypeNode(node)) {
    return getCsharpTypeParameterConstraintsForSyntaxNode(
      asNodeSubject(getNodeField(node, "Type")) ?? node,
      typeParameterName,
      context,
      host,
    );
  }
  if (ast.is.IsIntersectionTypeNode(node)) {
    return uniqueAndOrderConstraints(getNodeList(getNodeField(node, "Types"))
      .flatMap((constraint) => getCsharpTypeParameterConstraintsForSyntaxNode(constraint, typeParameterName, context, host)));
  }
  const keywordConstraint = getCsharpTypeParameterConstraintForKeywordTypeSyntax(ast, node, typeParameterName);
  if (keywordConstraint.handled) {
    return keywordConstraint.constraint === undefined ? [] : [keywordConstraint.constraint];
  }
  const targetType = host.getTargetTypeRefForSubject(node, context, {}) ??
    getTargetTypeRefForSyntaxNode(node, context.facts, ast);
  const constraint = targetType === undefined
    ? undefined
    : getCsharpTypeParameterConstraintForTargetType(targetType, typeParameterName);
  return constraint === undefined ? [] : [constraint];
}

function getCsharpTypeParameterConstraintForKeywordTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  typeParameterName: string,
): { readonly handled: true; readonly constraint?: CsharpTypeParameterConstraint } | { readonly handled: false } {
  switch (ast.kindName(node)) {
    case "KindNumberKeyword":
      return {
        handled: true,
        constraint: getCsharpTypeParameterConstraintForPrimitive("float64", typeParameterName),
      };
    case "KindBigIntKeyword":
    case "KindBooleanKeyword":
    case "KindStringKeyword":
    case "KindVoidKeyword":
      return { handled: true };
    default:
      return { handled: false };
  }
}

function getCsharpTypeParameterConstraintForTargetType(
  type: TargetTypeRef,
  typeParameterName: string,
): CsharpTypeParameterConstraint | undefined {
  if (type.kind === "source-primitive") {
    return getCsharpTypeParameterConstraintForPrimitive(type.name, typeParameterName);
  }
  if (type.kind === "target-named" || type.kind === "type-parameter") {
    return { kind: "csharp-type", type };
  }
  return undefined;
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

function uniqueAndOrderConstraints(
  constraints: readonly CsharpTypeParameterConstraint[],
): readonly CsharpTypeParameterConstraint[] {
  const byKey = new Map<string, CsharpTypeParameterConstraint>();
  for (const constraint of constraints) {
    byKey.set(csharpTypeParameterConstraintKey(constraint), constraint);
  }
  return [...byKey.values()].sort(compareCsharpTypeParameterConstraints);
}

function compareCsharpTypeParameterConstraints(
  left: CsharpTypeParameterConstraint,
  right: CsharpTypeParameterConstraint,
): number {
  return csharpTypeParameterConstraintOrder(left) - csharpTypeParameterConstraintOrder(right);
}

function csharpTypeParameterConstraintOrder(constraint: CsharpTypeParameterConstraint): number {
  if (constraint.kind === "csharp-keyword") {
    return 0;
  }
  if (constraint.kind === "csharp-constructor") {
    return 2;
  }
  return 1;
}

function csharpTypeParameterConstraintKey(constraint: CsharpTypeParameterConstraint): string {
  switch (constraint.kind) {
    case "csharp-type":
      return `type:${targetTypeRefKey(constraint.type)}`;
    case "csharp-keyword":
      return `keyword:${constraint.keyword}`;
    case "csharp-constructor":
      return "constructor";
    case "implements":
      return `implements:${constraint.contract}<${(constraint.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "lifetime":
      return `lifetime:${constraint.name}`;
    case "target-specific":
      return `target-specific:${constraint.target}:${constraint.name}`;
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "copy":
    case "clone":
    case "default":
    case "sized":
      return constraint.kind;
  }
}

function targetTypeRefKey(type: TargetTypeRef): string {
  switch (type.kind) {
    case "target-named":
      return `target:${type.id}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "source-primitive":
      return `source-primitive:${type.name}`;
    case "type-parameter":
      return `type-parameter:${type.name}`;
    case "array":
      return `array:${targetTypeRefKey(type.element)}`;
    case "tuple":
      return `tuple:${type.elements.map(targetTypeRefKey).join(",")}`;
    case "pointer":
      return `pointer:${targetTypeRefKey(type.pointee)}`;
    case "function-pointer":
      return `function-pointer:${type.args.map(targetTypeRefKey).join(",")}=>${targetTypeRefKey(type.result)}`;
    case "opaque":
      return `opaque:${type.id}`;
    case "associated-type":
      return `associated-type:${targetTypeRefKey(type.owner)}.${type.name}`;
    case "lifetime":
      return `lifetime:${type.name}`;
    case "target-specific":
      return `target-specific:${type.target}:${type.name}`;
  }
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
