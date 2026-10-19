import type { CsharpPlanningContext } from "../../context.js";
import {
  AsObjectLiteralExpression,
  KindMethodDeclaration,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  SourceKind,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  isCsharpJsValueObjectShapeTargetType,
  validateCsharpJsValueObjectShapeCarrier,
  csharpStringTargetType,
} from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/index.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
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
  if (isCsharpJsValueObjectShapeTargetType(objectShape.targetType)) {
    return planJsValueObjectLiteral(
      node,
      sourceFile,
      input,
      diagnostics,
      objectShape,
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
    return undefined;
  }
  const literal = AsObjectLiteralExpression(input.program.source.ast, node)!;
  const captures = planCsharpObjectCaptureAssignments(objectShape, node, input, diagnostics, state);
  if (captures === undefined) return undefined;
  const assignments: CsharpPlannedObjectInitializer[] = [];
  for (const property of literal.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    const planned = planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics, planExpression);
    if (planned === undefined) {
      return undefined;
    }
    assignments.push(...planned);
  }
  return planCsharpObjectInitialization(node, sourceFile, input, diagnostics, objectShape.targetType, type, captures, assignments);
}

function planJsValueObjectLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const carrierRejection = validateCsharpJsValueObjectShapeCarrier(objectShape);
  if (carrierRejection !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, carrierRejection));
    return undefined;
  }
  const literal = AsObjectLiteralExpression(input.program.source.ast, node)!;
  const arguments_: CsharpPlannedValue[] = [];
  for (const property of literal.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    const kind = SourceKind(input.program.source.ast, property);
    if (
      kind === KindSpreadAssignment ||
      kind === KindMethodDeclaration ||
      (kind !== KindPropertyAssignment &&
        kind !== KindShorthandPropertyAssignment)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        property,
        "Closed JS-value object literals require explicit property assignments; spread and method members need their own exact runtime operation contract.",
      ));
      return undefined;
    }
    const planned = planExplicitObjectShapeLiteralMember(
      property,
      objectShape,
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
    if (planned === undefined) {
      return undefined;
    }
    arguments_.push(
      csharpPlannedValue(csharpStringTargetType(), { kind: "LiteralExpression", value: planned.member.sourceName }),
      planned.expression,
    );
  }
  const operation = input.program.records.jsObjectLiteral.get(node);
  if (operation?.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      operation?.kind === "rejected"
        ? operation.reason
        : "C# object-literal planning requires a sealed JS-value operation classification produced during analysis.",
    ));
    return undefined;
  }
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, arguments_, values => translateCsharpJsValueInvocation(
    input.scope.typeParameterNames,
    operation,
    undefined,
    values,
  ), objectShape.targetType);
}
