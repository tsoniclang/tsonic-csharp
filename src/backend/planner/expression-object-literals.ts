import {
  AsObjectLiteralExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  const expectedObjectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input);
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
  input: TargetCompileInput,
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
  const assignments = mergeObjectInitializerAssignments((literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .flatMap((property) => planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType)));
  return {
    kind: "ObjectCreationExpression",
    type,
    assignments,
  };
}
