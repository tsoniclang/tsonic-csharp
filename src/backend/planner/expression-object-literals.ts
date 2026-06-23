import {
  AsObjectLiteralExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
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
): CsharpExpression {
  const objectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input) ??
    getExpectedObjectShapeFact(node, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, objectShape, planExpression, planExpressionWithExpectedType);
  }
  void expectedType;
  diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires finalized TSTS/provider object-shape facts before C# emission."));
  return invalidExpression("object literal without finalized object-shape facts");
}

function planObjectLiteralExpressionWithObjectShape(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression {
  const type = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
  if (type === undefined) {
    return invalidExpression("object literal with unrenderable object-shape carrier");
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
