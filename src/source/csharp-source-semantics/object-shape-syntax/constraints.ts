import type {
  ExtensionObservationContext,
  Node,
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTypeParameterConstraint,
} from "../../csharp-facts.js";
import {
  csharpTargetTypeParameterConstraintFactKey,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  getNodeNameText,
  visitAstReaderNodes,
} from "../ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";
import {
  sourcePrimitiveRuntimeKind,
} from "../target-rules.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../target-types.js";
import {
  getTargetTypeRefForSyntaxNode,
} from "./target-type-ref.js";

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

function recordCsharpTypeParameterConstraintFact(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): void {
  const ast = context.compiler?.ast;
  const constraintNode = asNodeSubject(getNodeField(node, "Constraint"));
  if (ast === undefined || constraintNode === undefined || getNodeNameText(ast, node).length === 0 || ast.kindName(node) !== "KindTypeParameter") {
    return;
  }
  const constraints = getCsharpTypeParameterConstraintsForSyntaxNode(constraintNode, getNodeNameText(ast, node), context, host);
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
        type: csharpTargetNamedType("System.Numerics.INumber`1", [{ kind: "type-parameter", name: typeParameterName }], csharpQualifiedTypeRenderShape("System.Numerics", "INumber")),
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
    case "source-global":
      return `source-global:${type.name}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
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
