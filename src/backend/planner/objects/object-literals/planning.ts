import type { CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/index.js";
import type { CsharpObjectLiteralEmission } from "../../../../target-model/records/object-literals.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { planCsharpObjectCaptureAssignments } from "../declarations/authored-methods.js";
import { csharpConstructibleTypeFromObjectShapeFact } from "../index.js";
import {
  translateCsharpJsValueInvocation,
} from "../../expressions/js-value-operations.js";
import type { ExpressionPlanner } from "../../expressions/expression-planner-types.js";
import {
  planExplicitObjectShapeLiteralMember,
  planObjectShapeLiteralAssignment,
} from "./assignments.js";
import { requireCsharpNativeExpressionUse } from "../../expressions/native-uses.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../expressions/planned-values.js";
import { buildCsharpPlannedValue } from "../../expressions/planned-value-composition.js";
import { planCsharpObjectInitialization, type CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";

export function planObjectLiteralExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState
): CsharpPlannedValue | undefined {
  const selected = requireCsharpNativeExpressionUse(input, node).use;
  if (selected.kind === "erased" || selected.objectShape === undefined) return failCsharpPlannerInvariant(
    "Native object construction requires its admitted physical shape.", node);
  return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, selected.objectShape, planExpression, state);
}

function planObjectLiteralExpressionWithObjectShape(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], objectShape: CsharpObjectShapeFact, planExpression: ExpressionPlanner, state?: DestructuringPlannerState
): CsharpPlannedValue | undefined {
  const selected = input.program.records.objectLiteral.get(objectShape, node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object literal requires its sealed native member inventory.", node);
  if (selected.kind === "js") {
    return planJsValueObjectLiteral(
      node,
      sourceFile,
      input,
      diagnostics,
      objectShape,
      selected,
      planExpression,
    );
  }
  const type = csharpConstructibleTypeFromObjectShapeFact(
    input,
    objectShape,
    diagnostics,
    node,
  );
  if (type === undefined) {
    failCsharpPlannerInvariant("An admitted native object literal requires its constructible native type.", node);
  }
  const captures = planCsharpObjectCaptureAssignments(objectShape, node, input, diagnostics, state);
  if (captures === undefined) failCsharpPlannerInvariant("An admitted native object literal requires its sealed capture initialization.", node);
  const assignments: CsharpPlannedObjectInitializer[] = [];
  for (const { property } of selected.members) {
    const planned = planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics, planExpression);
    if (planned === undefined) {
      failCsharpPlannerInvariant("An admitted native object literal member requires its initialization plan.", property);
    }
    assignments.push(...planned);
  }
  return planCsharpObjectInitialization(node, sourceFile, input, diagnostics, objectShape.targetType, type, selected.initialization, captures, assignments);
}

function planJsValueObjectLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  selected: Extract<CsharpObjectLiteralEmission, { readonly kind: "js" }>,
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const arguments_: CsharpPlannedValue[] = [];
  for (const member of selected.members) {
    const { property } = member;
    if (member.kind !== "value") failCsharpPlannerInvariant("An admitted JS object literal requires its explicit property initialization plan.", property);
    const planned = planExplicitObjectShapeLiteralMember(
      property,
      objectShape,
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
    arguments_.push(
      csharpPlannedValue(selected.keyCarrier, { kind: "LiteralExpression", value: planned.member.sourceName }),
      planned.expression,
    );
  }
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, arguments_, values => translateCsharpJsValueInvocation(
    input.scope.typeParameterNames,
    selected.operation,
    undefined,
    values,
  ), objectShape.targetType);
}
