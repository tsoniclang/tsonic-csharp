import {
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  KindMethodDeclaration,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  Node_Name,
  SourceKind,
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
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  findObjectShapeMember,
  getObjectLiteralPropertySourceName,
} from "./expression-object-literal-support.js";
import {
  planObjectShapeMethodMemberAssignment,
} from "./expression-object-literal-methods.js";
import {
  planObjectShapeSpreadAssignments,
} from "./expression-object-literal-spread.js";

export function planObjectShapeLiteralAssignment(
  property: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): readonly CsharpObjectInitializerAssignment[] | undefined {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        return undefined;
      }
      if (member === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property must match a finalized provider object-shape member."));
        return undefined;
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return undefined;
      }
      const expression = planExpressionWithExpectedType(propertyAssignment.Initializer, sourceFile, input, diagnostics, memberType, undefined, member.type);
      if (expression === undefined) {
        return undefined;
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression,
      }];
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return undefined;
      }
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      const nameNode = Node_Name(property);
      if (member === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand must match a finalized provider object-shape member."));
        return undefined;
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return undefined;
      }
      const expression = planExpressionWithExpectedType(nameNode, sourceFile, input, diagnostics, memberType, undefined, member.type);
      if (expression === undefined) {
        return undefined;
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression,
      }];
    }
    case KindMethodDeclaration: {
      const assignment = planObjectShapeMethodMemberAssignment(property, objectShape, sourceFile, input, diagnostics);
      return assignment === undefined ? undefined : [assignment];
    }
    case KindSpreadAssignment:
      return planObjectShapeSpreadAssignments(property, objectShape, sourceFile, input, diagnostics, planExpression);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return undefined;
  }
}
