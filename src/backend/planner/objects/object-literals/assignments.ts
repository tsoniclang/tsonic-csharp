import type { CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../../../target-model/types/index.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import {
  objectShapeStorageMemberName,
} from "../index.js";
import type { ExpressionPlanner } from "../../expressions/expression-planner-types.js";
import {
  planObjectShapeMethodMemberAssignment,
} from "./methods.js";
import {
  planObjectShapeAccessorMemberAssignment,
} from "./accessors.js";
import {
  planObjectShapeSpreadAssignments,
} from "./spread.js";
import type { CsharpPlannedValue } from "../../expressions/planned-values.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";

export function planObjectShapeLiteralAssignment(property: Node, objectShape: CsharpObjectShapeFact, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner
): readonly CsharpPlannedObjectInitializer[] | undefined {
  const selected = input.program.records.objectLiteralMember.get(objectShape, property);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object literal member requires its native initialization plan.", property);
  switch (selected.kind) {
    case "value": {
      const planned = planExplicitObjectShapeLiteralMember(
        property,
        objectShape,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
      return [{ value: planned.expression, presence: { kind: "required" }, assignments: expression => [{
            kind: "AssignmentExpression",
            name: objectShapeStorageMemberName(objectShape, planned.member),
            carrier: planned.member.type,
            expression,
          }] }];
    }
    case "authored":
      return [];
    case "method": {
      const assignment = planObjectShapeMethodMemberAssignment(property, objectShape, sourceFile, input, diagnostics);
      return assignment === undefined ? undefined : [assignment];
    }
    case "accessor": {
      const assignment = planObjectShapeAccessorMemberAssignment(
        property,
        objectShape,
        sourceFile,
        input,
        diagnostics,
      );
      return assignment === undefined ? undefined : [assignment];
    }
    case "spread":
      const spread = planObjectShapeSpreadAssignments(property, objectShape, sourceFile, input, diagnostics, planExpression);
      return spread === undefined ? undefined : [spread];
  }
}

export interface CsharpPlannedObjectShapeLiteralMember {
  readonly member: CsharpObjectShapeMemberFact;
  readonly expression: CsharpPlannedValue;
}

export function planExplicitObjectShapeLiteralMember(
  property: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedObjectShapeLiteralMember {
  const selected = input.program.records.objectLiteralMember.get(objectShape, property);
  if (selected?.kind !== "value") failCsharpPlannerInvariant("An admitted explicit object literal member requires its exact native initializer.", property);
  const expression = planExpression(selected.initializer, sourceFile, input, diagnostics);
  if (expression === undefined) failCsharpPlannerInvariant("An admitted object literal initializer requires its native value plan.", selected.initializer);
  return { member: selected.member, expression };
}
