import type { CsharpPlanningContext } from "../context.js";
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
import type { TargetTypeRef } from "../../../policy/types/index.js";
import {
  isCsharpJsValueTargetType,
  isCsharpJsValueObjectShapeTargetType,
  projectCsharpJsValueObjectLiteralShape,
  validateCsharpJsValueObjectShapeCarrier,
} from "../../../policy/types/index.js";
import {
  selectCsharpJsObjectLiteralOperation,
} from "../../../policy/js-value-operations/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpObjectShapeFact } from "../../../policy/types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpConstructibleTypeFromObjectShapeFact } from "../objects/index.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  planExplicitObjectShapeLiteralMember,
  planObjectShapeLiteralAssignment,
} from "./expression-object-literal-assignments.js";
import {
  getExpectedObjectShapeFact,
  mergeObjectInitializerAssignments,
} from "./expression-object-literal-support.js";

export function planObjectLiteralExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expectedObjectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input, expectedTargetType);
  const resolved = input.types.objectShapes.resolveObjectLiteralTargetShape(
    expectedObjectShape ?? getExpectedObjectShapeFact(node, sourceFile, input),
    node,
    sourceFile,
  );
  if (resolved.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      resolved.subject,
      resolved.reason,
    ));
    return undefined;
  }
  let objectShape = resolved.kind === "resolved" ? resolved.shape : undefined;
  if (
    objectShape !== undefined &&
    isCsharpJsValueTargetType(expectedTargetType) &&
    !isCsharpJsValueObjectShapeTargetType(objectShape.targetType)
  ) {
    const projection = projectCsharpJsValueObjectLiteralShape(objectShape);
    if (projection.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, projection.reason));
      return undefined;
    }
    objectShape = projection.shape;
  }
  if (objectShape !== undefined) {
    return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, objectShape, planExpression, planExpressionWithExpectedType);
  }
  void expectedType;
  diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires finalized TSTS/provider object-shape facts before C# emission."));
  return undefined;
}

function planObjectLiteralExpressionWithObjectShape(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (isCsharpJsValueObjectShapeTargetType(objectShape.targetType)) {
    return planJsValueObjectLiteral(
      node,
      sourceFile,
      input,
      diagnostics,
      objectShape,
      planExpressionWithExpectedType,
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

function planJsValueObjectLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  const carrierRejection = validateCsharpJsValueObjectShapeCarrier(objectShape);
  if (carrierRejection !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, carrierRejection));
    return undefined;
  }
  const literal = AsObjectLiteralExpression(input.program.source.ast, node)!;
  const arguments_: CsharpExpression[] = [];
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
      planExpressionWithExpectedType,
    );
    if (planned === undefined) {
      return undefined;
    }
    arguments_.push(
      { kind: "LiteralExpression", value: planned.member.sourceName },
      planned.expression,
    );
  }
  return translateCsharpJsValueInvocation(
    selectCsharpJsObjectLiteralOperation(),
    undefined,
    arguments_,
  );
}
