import type { CsharpTranslationContext } from "../../translate/context/index.js";
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
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../policy/types/index.js";
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): readonly CsharpObjectInitializerAssignment[] | undefined {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment:
    case KindShorthandPropertyAssignment: {
      const planned = planExplicitObjectShapeLiteralMember(
        property,
        objectShape,
        sourceFile,
        input,
        diagnostics,
        planExpressionWithExpectedType,
      );
      return planned === undefined
        ? undefined
        : [{
            kind: "AssignmentExpression",
            name: objectShapeStorageMemberName(objectShape, planned.member),
            expression: planned.expression,
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

export interface CsharpPlannedObjectShapeLiteralMember {
  readonly member: CsharpObjectShapeMemberFact;
  readonly expression: CsharpExpression;
}

export function planExplicitObjectShapeLiteralMember(
  property: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpPlannedObjectShapeLiteralMember | undefined {
  const kind = SourceKind(input.ast, property);
  const initializer = kind === KindPropertyAssignment
    ? AsPropertyAssignment(property)?.Initializer
    : kind === KindShorthandPropertyAssignment
    ? Node_Name(input.ast, property)
    : undefined;
  if (kind === KindShorthandPropertyAssignment) {
    const shorthand = AsShorthandPropertyAssignment(property);
    if (shorthand?.ObjectAssignmentInitializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        property,
        "Object literal shorthand defaults require finalized default-value semantics before C# emission.",
      ));
      return undefined;
    }
  }
  if (initializer === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      property,
      "Explicit object literal members require an exact initializer expression.",
    ));
    return undefined;
  }
  const sourceName = getObjectLiteralPropertySourceName(
    property,
    input,
    diagnostics,
  );
  const member = sourceName === undefined
    ? undefined
    : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      property,
      "Object literal property must match one finalized object-shape source contract member.",
    ));
    return undefined;
  }
  const memberType = csharpTypeFromTargetTypeRef(member.type);
  if (memberType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      property,
      `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`,
    ));
    return undefined;
  }
  const expression = planExpressionWithExpectedType(
    initializer,
    sourceFile,
    input,
    diagnostics,
    memberType,
    undefined,
    member.type,
  );
  return expression === undefined ? undefined : { member, expression };
}
