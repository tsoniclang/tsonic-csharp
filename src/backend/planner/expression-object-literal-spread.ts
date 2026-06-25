import {
  AsSpreadAssignment,
  HasSourceKind,
  KindIdentifier,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpObjectInitializerAssignment,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  objectShapeStorageMemberName,
} from "./object-shapes.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getExpectedObjectShapeFact,
  objectShapeMemberTypesMatch,
} from "./expression-object-literal-support.js";

export function planObjectShapeSpreadAssignments(
  spreadNode: Node,
  targetShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpObjectInitializerAssignment[] {
  const spread = AsSpreadAssignment(spreadNode);
  const expression = spread?.Expression;
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a source expression."));
    return [];
  }
  if (!HasSourceKind(input.ast, expression, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a single-evaluation provider lowering for non-identifier spread expressions before C# emission."));
    return [];
  }
  const sourceShape = getExpectedObjectShapeFact(expression, sourceFile, input);
  if (sourceShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires finalized provider object-shape facts for the spread expression before C# emission."));
    return [];
  }
  const sourceExpression = planExpression(expression, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return [];
  }
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const sourceMember of sourceShape.members) {
    const targetMember = targetShape.members.find((member) => member.sourceName === sourceMember.sourceName);
    if (targetMember === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread source member '${sourceMember.sourceName}' requires a finalized target object-shape member carrier before C# emission.`));
      return [];
    }
    if (!objectShapeMemberTypesMatch(sourceMember, targetMember)) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread member '${sourceMember.sourceName}' requires matching finalized source and target member carriers.`));
      return [];
    }
    assignments.push({
      kind: "AssignmentExpression",
      name: objectShapeStorageMemberName(targetShape, targetMember),
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      },
    });
  }
  return assignments;
}
