import {
  AsMethodDeclaration,
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  HasSourceKind,
  KindIdentifier,
  KindMethodDeclaration,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindStringLiteral,
  Node_Name,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../roslyn/syntax.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { planBlockStatements } from "./statements.js";
import {
  diagnoseMissingLambdaTargetContext,
  isAsyncExpression,
  isCsharpDelegateType,
  planLambdaParameters,
} from "./expression-lambdas.js";

type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression;

type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
) => CsharpExpression;

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

function getExpectedObjectShapeFact(
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(expectedTypeSubject, sourceFile, input);
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

function planObjectShapeLiteralAssignment(
  property: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): readonly CsharpObjectInitializerAssignment[] {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        return [];
      }
      if (member === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property must match a finalized provider object-shape member."));
        return [];
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression: planExpressionWithExpectedType(propertyAssignment.Initializer, sourceFile, input, diagnostics, memberType),
      }];
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return [];
      }
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      const nameNode = Node_Name(property);
      if (member === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand must match a finalized provider object-shape member."));
        return [];
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression: planExpressionWithExpectedType(nameNode, sourceFile, input, diagnostics, memberType),
      }];
    }
    case KindMethodDeclaration: {
      const assignment = planObjectShapeMethodMemberAssignment(property, objectShape, sourceFile, input, diagnostics);
      return assignment === undefined ? [] : [assignment];
    }
    case KindSpreadAssignment:
      return planObjectShapeSpreadAssignments(property, objectShape, sourceFile, input, diagnostics, planExpression);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return [];
  }
}

function planObjectShapeSpreadAssignments(
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
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const targetMember of targetShape.members) {
    const sourceMember = sourceShape.members.find((member) => member.sourceName === targetMember.sourceName);
    if (sourceMember === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread source shape does not provide required member '${targetMember.sourceName}'.`));
      return [];
    }
    if (!objectShapeMemberTypesMatch(sourceMember, targetMember)) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread member '${targetMember.sourceName}' requires matching finalized source and target member carriers.`));
      return [];
    }
    assignments.push({
      kind: "AssignmentExpression",
      name: objectShapeStorageMemberName(targetShape, targetMember),
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: planExpression(expression, sourceFile, input, diagnostics),
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      },
    });
  }
  return assignments;
}

function planObjectShapeMethodMemberAssignment(
  methodNode: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, input, diagnostics);
  const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method must match a finalized provider object-shape member."));
    return undefined;
  }
  const memberType = csharpTypeFromTargetTypeRef(member.type);
  if (memberType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a renderable delegate target type before C# emission.`));
    return undefined;
  }
  if (!isCsharpDelegateType(memberType)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a finalized delegate target type before C# emission.`));
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    name: objectShapeStorageMemberName(objectShape, member),
    expression: planObjectLiteralMethodAsLambda(methodNode, sourceFile, input, diagnostics, memberType),
  };
}

function planObjectLiteralMethodAsLambda(
  methodNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
): CsharpExpression {
  const method = AsMethodDeclaration(methodNode);
  diagnoseMissingLambdaTargetContext(methodNode, sourceFile, input, diagnostics, expectedType);
  if (method === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method-declaration AST node."));
    return invalidExpression("object literal method without method declaration");
  }
  if ((method.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal generic methods require finalized target delegate facts before C# emission."));
    return invalidExpression("generic object literal method");
  }
  if (method.Body === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method body."));
    return invalidExpression("object literal method without body");
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(methodNode) ? { async: true } : {}),
    parameters: planLambdaParameters(method.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      kind: "Block",
      statements: planBlockStatements(method.Body, sourceFile, input, diagnostics),
    },
  };
}

function findObjectShapeMember(objectShape: CsharpObjectShapeFact, sourceName: string): CsharpObjectShapeFact["members"][number] | undefined {
  return objectShape.members.find((member) => member.sourceName === sourceName);
}

function mergeObjectInitializerAssignments(assignments: readonly CsharpObjectInitializerAssignment[]): readonly CsharpObjectInitializerAssignment[] {
  const merged = new Map<string, CsharpObjectInitializerAssignment>();
  for (const assignment of assignments) {
    merged.set(assignment.name, assignment);
  }
  return [...merged.values()];
}

function objectShapeMemberTypesMatch(left: CsharpObjectShapeFact["members"][number], right: CsharpObjectShapeFact["members"][number]): boolean {
  return targetTypeRefsMatch(left.type, right.type);
}

function getObjectLiteralPropertySourceName(
  property: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = input.ast.name(property) ?? Node_Name(property);
  if (nameNode === undefined || (!HasSourceKind(input.ast, nameNode, KindIdentifier) && !HasSourceKind(input.ast, nameNode, KindStringLiteral))) {
    diagnostics.push(unsupportedNodeDiagnostic(nameNode ?? property, "Object-shape object initializers require identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(nameNode);
}
