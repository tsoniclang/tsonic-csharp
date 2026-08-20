import type { CsharpPlanningContext } from "../context.js";
import {
  AsConditionalExpression,
  AsParenthesizedExpression,
  AsSatisfiesExpression,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindArrowFunction,
  KindAsExpression,
  KindBinaryExpression,
  KindConditionalExpression,
  KindFunctionExpression,
  KindIdentifier,
  KindNonNullExpression,
  KindObjectLiteralExpression,
  KindParenthesizedExpression,
  KindSatisfiesExpression,
  KindTypeAssertionExpression,
  Node_Text,
  SourceKind,
  KindNullKeyword,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { ExpressionPlanner, ExpectedExpressionPlanner } from "./expression-planner-types.js";
import {
  planArrayLiteralExpression,
  planArrayLiteralExpressionWithCarrier,
  planTupleLiteralExpression,
} from "./array-literals/index.js";
import {
  getTargetTypeRefForNode,
} from "../types/runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import { planObjectLiteralExpressionWithExpectedType } from "./expression-object-literals.js";
import {
  tryPlanRecordDictionaryLiteralWithExpectedType,
} from "./expression-dictionary-literals.js";
import {
  tryPlanBinaryExpressionWithExpectedType,
} from "./operators.js";
import {
  planCsharpConditionExpression,
} from "./expression-bool-carriers.js";
import {
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpImplicitArrayInputElementTargetType,
  targetTypeRefEquals,
} from "../../../policy/types/index.js";
import {
  csharpConversionIsApplicable,
  selectCsharpConversion,
} from "../../../policy/conversions/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planCsharpExactLiteralConversion,
} from "./literal-conversions.js";

export interface ExpectedTypeExpressionPlanners {
  readonly planExpression: ExpressionPlanner;
  readonly planExpressionWithExpectedType: ExpectedExpressionPlanner;
}

export interface ExpectedTypeExpressionPlan {
  readonly expression: CsharpExpression;
  readonly representation: "source" | "expected";
}

export function planExpressionWithExpectedTypeCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planners: ExpectedTypeExpressionPlanners,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): ExpectedTypeExpressionPlan | undefined {
  const effectiveExpectedTargetType = expectedTargetType ??
    (expectedTypeSubject === undefined ? undefined : getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile));
  const expectedRuntimeNullishLiteral = planExpectedRuntimeNullishLiteral(node, sourceFile, input, expectedTargetType, expectedTypeSubject);
  if (expectedRuntimeNullishLiteral !== undefined) {
    return expectedRepresentation(expectedRuntimeNullishLiteral);
  }
  const expectedTypeLiteral = planCsharpExactLiteralConversion(
    input,
    node,
    effectiveExpectedTargetType,
  );
  if (expectedTypeLiteral.kind === "resolved") {
    return expectedRepresentation(expectedTypeLiteral.expression);
  }
  if (expectedTypeLiteral.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, expectedTypeLiteral.reason));
    return undefined;
  }
  if (HasSourceKind(input.program.source.ast, node, KindAsExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindSatisfiesExpression)) {
    return expectedRepresentation(
      planners.planExpressionWithExpectedType(AsSatisfiesExpression(input.program.source.ast, node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindNonNullExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindTypeAssertionExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindParenthesizedExpression)) {
    const expression = AsParenthesizedExpression(input.program.source.ast, node)!;
    const inner = planners.planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    if (inner === undefined) {
      return undefined;
    }
    return expectedRepresentation({
      kind: "ParenthesizedExpression",
      expression: inner,
    });
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrowFunction)) {
    return expectedRepresentation(
      planArrowFunctionExpression(node, sourceFile, input, diagnostics, planners.planExpression, expectedType, state, expectedTargetType, planners.planExpressionWithExpectedType),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindFunctionExpression)) {
    return expectedRepresentation(
      planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, state, expectedTargetType),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindObjectLiteralExpression)) {
    const dictionaryDiagnosticsStart = diagnostics.length;
    const dictionaryLiteral = tryPlanRecordDictionaryLiteralWithExpectedType(node, sourceFile, input, diagnostics, expectedTypeSubject, planners.planExpressionWithExpectedType);
    if (dictionaryLiteral !== undefined) {
      return expectedRepresentation(dictionaryLiteral);
    }
    if (diagnostics.length > dictionaryDiagnosticsStart) {
      return undefined;
    }
    return expectedRepresentation(
      planObjectLiteralExpressionWithExpectedType(
        node,
        sourceFile,
        input,
        diagnostics,
        expectedType,
        expectedTypeSubject,
        planners.planExpression,
        planners.planExpressionWithExpectedType,
        expectedTargetType,
      ),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindBinaryExpression)) {
    const binaryDiagnosticsStart = diagnostics.length;
    const binaryExpression = tryPlanBinaryExpressionWithExpectedType(
      node,
      sourceFile,
      input,
      diagnostics,
      expectedType,
      expectedTypeSubject,
      effectiveExpectedTargetType,
      planners.planExpression,
      planners.planExpressionWithExpectedType,
    );
    if (binaryExpression !== undefined) {
      return expectedRepresentation(binaryExpression);
    }
    if (diagnostics.length > binaryDiagnosticsStart) {
      return undefined;
    }
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "tuple") {
    return expectedRepresentation(
      planTupleLiteralExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        planners,
        csharpTypeFromTargetTypeRef(expectedTargetType),
        expectedTargetType,
      ),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    const resolvedTupleTarget = input.types.policy.resolveNode(node, sourceFile);
    return expectedRepresentation(
      planTupleLiteralExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        planners,
        expectedType,
        resolvedTupleTarget?.kind === "tuple"
          ? resolvedTupleTarget
          : undefined,
      ),
    );
  }
  if (
    HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) &&
    effectiveExpectedTargetType !== undefined
  ) {
    const implicitArrayInputElement =
      getCsharpImplicitArrayInputElementTargetType(
        effectiveExpectedTargetType,
      );
    const sourceCarrier = implicitArrayInputElement === undefined
      ? getTargetTypeRefForNode(input, node, sourceFile) ??
        input.types.policy.resolveNode(node, sourceFile)
      : { kind: "array" as const, element: implicitArrayInputElement };
    const conversion = selectCsharpConversion(
      input.policy,
      sourceCarrier,
      effectiveExpectedTargetType,
      "implicit",
    );
    if (csharpConversionIsApplicable(conversion, "implicit")) {
      return sourceRepresentation(
        planArrayLiteralExpressionWithCarrier(
          node,
          sourceFile,
          input,
          diagnostics,
          sourceCarrier,
          planners,
        ),
      );
    }
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return expectedRepresentation(
      planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType, planners, expectedTargetType?.kind === "array" ? expectedTargetType.element : undefined),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedTargetType !== undefined && expectedTargetType.kind !== "array" && expectedTargetType.kind !== "tuple") {
    return expectedRepresentation(
      planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "array") {
    return expectedRepresentation(
      planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners),
    );
  }
  if (HasSourceKind(input.program.source.ast, node, KindArrayLiteralExpression) && expectedTypeSubject !== undefined) {
    const expectedCarrier = getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
    if (expectedCarrier !== undefined && expectedCarrier.kind !== "array" && expectedCarrier.kind !== "tuple") {
      return expectedRepresentation(
        planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedCarrier, planners),
      );
    }
  }
  if (HasSourceKind(input.program.source.ast, node, KindConditionalExpression)) {
    const expression = AsConditionalExpression(input.program.source.ast, node)!;
    if (expression.Condition === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Conditional expression requires a condition expression."));
      return undefined;
    }
    const condition = planCsharpConditionExpression(
      expression.Condition,
      "Conditional expression condition",
      sourceFile,
      input,
      diagnostics,
      planners.planExpression,
    );
    const whenTrue = planners.planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    const whenFalse = planners.planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    if (condition === undefined || whenTrue === undefined || whenFalse === undefined) {
      return undefined;
    }
    return expectedRepresentation({
      kind: "ConditionalExpression",
      condition,
      whenTrue,
      whenFalse,
    });
  }
  const expression = planners.planExpression(node, sourceFile, input, diagnostics);
  return sourceRepresentation(expression);
}

function sourceRepresentation(
  expression: CsharpExpression | undefined,
): ExpectedTypeExpressionPlan | undefined {
  return expression === undefined
    ? undefined
    : { expression, representation: "source" };
}

function expectedRepresentation(
  expression: CsharpExpression | undefined,
): ExpectedTypeExpressionPlan | undefined {
  return expression === undefined
    ? undefined
    : { expression, representation: "expected" };
}

function planExpectedRuntimeNullishLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  expectedTargetType: TargetTypeRef | undefined,
  expectedTypeSubject: Node | undefined,
): CsharpExpression | undefined {
  const effectiveExpectedTargetType = expectedTargetType ??
    (expectedTypeSubject === undefined ? undefined : getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile));
  if (effectiveExpectedTargetType === undefined) {
    return undefined;
  }
  const nullCarrier = csharpRuntimeNullTargetType();
  if (targetAcceptsRuntimeCarrier(effectiveExpectedTargetType, nullCarrier) && HasSourceKind(input.program.source.ast, node, KindNullKeyword)) {
    return runtimeCarrierSingletonValue(nullCarrier);
  }
  const undefinedCarrier = csharpRuntimeUndefinedTargetType();
  if (
    targetAcceptsRuntimeCarrier(effectiveExpectedTargetType, undefinedCarrier) &&
    isGlobalUndefinedLiteral(node, sourceFile, input)
  ) {
    return runtimeCarrierSingletonValue(undefinedCarrier);
  }
  return undefined;
}

function targetAcceptsRuntimeCarrier(expectedTargetType: TargetTypeRef, carrier: TargetTypeRef): boolean {
  return targetTypeRefEquals(expectedTargetType, carrier) ||
    (getCsharpRuntimeUnionArms(expectedTargetType)?.some((arm) => targetTypeRefEquals(arm, carrier)) === true);
}

function runtimeCarrierSingletonValue(carrier: TargetTypeRef): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(carrier);
  return type === undefined
    ? undefined
    : {
        kind: "SimpleMemberAccessExpression",
        receiver: type,
        name: "value",
      };
}

function isGlobalUndefinedLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  if (SourceKind(input.program.source.ast, node) !== KindIdentifier || Node_Text(input.program.source.ast, node) !== "undefined") {
    return false;
  }
  if (
    input.program.source.navigation.referenceFor(node) !== undefined
  ) {
    return false;
  }
  const targetType = input.types.policy.resolveNode(node, sourceFile);
  return targetType !== undefined &&
    targetTypeRefEquals(targetType, csharpRuntimeUndefinedTargetType());
}
