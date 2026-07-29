import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsObjectLiteralExpression,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../roslyn/syntax.js";
import type { CsharpObjectShapeFact } from "../../policy/types/index.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  planObjectShapeLiteralAssignment,
} from "./expression-object-literal-assignments.js";
import {
  getExpectedObjectShapeFact,
  mergeObjectInitializerAssignments,
} from "./expression-object-literal-support.js";

export function planObjectLiteralExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expectedObjectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input, expectedTargetType);
  const objectShape = expectedObjectShape !== undefined && !isInterfaceObjectShape(expectedObjectShape)
    ? expectedObjectShape
    : getExpectedObjectShapeFact(node, sourceFile, input) ?? expectedObjectShape;
  if (objectShape !== undefined) {
    return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, objectShape, planExpression, planExpressionWithExpectedType);
  }
  void expectedType;
  diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires finalized TSTS/provider object-shape facts before C# emission."));
  return undefined;
}

function isInterfaceObjectShape(objectShape: CsharpObjectShapeFact): boolean {
  return (objectShape.targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "interface";
}

function planObjectLiteralExpressionWithObjectShape(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  const type = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
  if (type === undefined) {
    return undefined;
  }
  const literal = AsObjectLiteralExpression(node)!;
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const property of literal.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    const planned = planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType);
    if (planned === undefined) {
      return undefined;
    }
    assignments.push(...planned);
  }
  return {
    kind: "ObjectCreationExpression",
    type,
    assignments: mergeObjectInitializerAssignments(assignments),
  };
}
