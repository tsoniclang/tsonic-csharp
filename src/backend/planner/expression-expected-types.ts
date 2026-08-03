import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsConditionalExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsSatisfiesExpression,
  AsStringLiteral,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindArrowFunction,
  KindAsExpression,
  KindBinaryExpression,
  KindConditionalExpression,
  KindFunctionExpression,
  KindIdentifier,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindParenthesizedExpression,
  KindSatisfiesExpression,
  KindStringLiteral,
  KindTypeAssertionExpression,
  Node_Text,
  SourceKind,
  KindNullKeyword,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import type { ExpressionPlanner, ExpectedExpressionPlanner } from "./expression-planner-types.js";
import {
  planArrayLiteralExpression,
  planArrayLiteralExpressionWithCarrier,
  planTupleLiteralExpression,
} from "./array-literals/index.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import { planObjectLiteralExpressionWithExpectedType } from "./expression-object-literals.js";
import {
  tryPlanRecordDictionaryLiteralWithExpectedType,
} from "./expression-dictionary-literals.js";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";
import {
  tryPlanBinaryExpressionWithExpectedType,
} from "./expression-operators.js";
import {
  planCsharpConditionExpression,
} from "./expression-bool-carriers.js";
import {
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpImplicitArrayInputElementTargetType,
  isCsharpNullableReferenceTargetType,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import {
  csharpConversionIsApplicable,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";

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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planners: ExpectedTypeExpressionPlanners,
  expectedTargetType?: TargetTypeRef,
): ExpectedTypeExpressionPlan | undefined {
  const effectiveExpectedTargetType = expectedTargetType ??
    (expectedTypeSubject === undefined ? undefined : getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile));
  const expectedRuntimeNullishLiteral = planExpectedRuntimeNullishLiteral(node, sourceFile, input, expectedTargetType, expectedTypeSubject);
  if (expectedRuntimeNullishLiteral !== undefined) {
    return expectedRepresentation(expectedRuntimeNullishLiteral);
  }
  const expectedTypeLiteral = planExpectedTypeLiteral(node, input, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedRepresentation(expectedTypeLiteral);
  }
  if (HasSourceKind(input.ast, node, KindAsExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.ast, node, KindSatisfiesExpression)) {
    return expectedRepresentation(
      planners.planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType),
    );
  }
  if (HasSourceKind(input.ast, node, KindNonNullExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.ast, node, KindTypeAssertionExpression)) {
    return sourceRepresentation(
      planners.planExpression(node, sourceFile, input, diagnostics),
    );
  }
  if (HasSourceKind(input.ast, node, KindParenthesizedExpression)) {
    const expression = AsParenthesizedExpression(node)!;
    const inner = planners.planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    if (inner === undefined) {
      return undefined;
    }
    return expectedRepresentation({
      kind: "ParenthesizedExpression",
      expression: inner,
    });
  }
  if (HasSourceKind(input.ast, node, KindArrowFunction)) {
    return expectedRepresentation(
      planArrowFunctionExpression(node, sourceFile, input, diagnostics, planners.planExpression, expectedType, undefined, expectedTargetType, planners.planExpressionWithExpectedType),
    );
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return expectedRepresentation(
      planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, undefined, expectedTargetType),
    );
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
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
  if (HasSourceKind(input.ast, node, KindBinaryExpression)) {
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
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "tuple") {
    return expectedRepresentation(
      planTupleLiteralExpression(node, sourceFile, input, diagnostics, planners, csharpTypeFromTargetTypeRef(expectedTargetType)),
    );
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    return expectedRepresentation(
      planTupleLiteralExpression(node, sourceFile, input, diagnostics, planners, expectedType),
    );
  }
  if (
    HasSourceKind(input.ast, node, KindArrayLiteralExpression) &&
    effectiveExpectedTargetType !== undefined
  ) {
    const implicitArrayInputElement =
      getCsharpImplicitArrayInputElementTargetType(
        effectiveExpectedTargetType,
      );
    const sourceCarrier = implicitArrayInputElement === undefined
      ? getTargetTypeRefForNode(input, node, sourceFile) ??
        input.types.resolveNode(node, sourceFile)
      : { kind: "array" as const, element: implicitArrayInputElement };
    const conversion = selectCsharpConversion(
      input,
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
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return expectedRepresentation(
      planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType, planners, expectedTargetType?.kind === "array" ? expectedTargetType.element : undefined),
    );
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType !== undefined && expectedTargetType.kind !== "array" && expectedTargetType.kind !== "tuple") {
    return expectedRepresentation(
      planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners),
    );
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "array") {
    return expectedRepresentation(
      planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners),
    );
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTypeSubject !== undefined) {
    const expectedCarrier = getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
    if (expectedCarrier !== undefined && expectedCarrier.kind !== "array" && expectedCarrier.kind !== "tuple") {
      return expectedRepresentation(
        planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedCarrier, planners),
      );
    }
  }
  if (HasSourceKind(input.ast, node, KindConditionalExpression)) {
    const expression = AsConditionalExpression(node)!;
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
  return sourceRepresentation(
    projectNullableValueForExpectedTarget(
      node,
      sourceFile,
      input,
      expression,
      effectiveExpectedTargetType,
    ),
  );
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

function projectNullableValueForExpectedTarget(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  expression: CsharpExpression | undefined,
  expectedTargetType: TargetTypeRef | undefined,
): CsharpExpression | undefined {
  if (expression === undefined || expectedTargetType === undefined) {
    return expression;
  }
  const selectedTargetType = getTargetTypeRefForNode(input, node, sourceFile);
  const storageTargetType = input.types.resolveStorage(node, sourceFile);
  if (
    selectedTargetType === undefined ||
    storageTargetType === undefined ||
    isCsharpNullableReferenceTargetType(storageTargetType)
  ) {
    return expression;
  }
  const nullableElementType = getCsharpNullableElementTargetType(storageTargetType);
  if (
    nullableElementType === undefined ||
    !targetTypeRefEquals(nullableElementType, selectedTargetType) ||
    !targetTypeRefEquals(selectedTargetType, expectedTargetType)
  ) {
    return expression;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: expression,
    name: "Value",
  };
}

function planExpectedRuntimeNullishLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  expectedTargetType: TargetTypeRef | undefined,
  expectedTypeSubject: Node | undefined,
): CsharpExpression | undefined {
  const effectiveExpectedTargetType = expectedTargetType ??
    (expectedTypeSubject === undefined ? undefined : getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile));
  if (effectiveExpectedTargetType === undefined) {
    return undefined;
  }
  const nullCarrier = csharpRuntimeNullTargetType();
  if (targetAcceptsRuntimeCarrier(effectiveExpectedTargetType, nullCarrier) && HasSourceKind(input.ast, node, KindNullKeyword)) {
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
  input: CsharpTranslationContext,
): boolean {
  if (SourceKind(input.ast, node) !== KindIdentifier || Node_Text(input.ast, node) !== "undefined") {
    return false;
  }
  if (
    input.navigation.referenceFor(node) !== undefined
  ) {
    return false;
  }
  const targetType = input.types.resolveNode(node, sourceFile);
  return targetType !== undefined &&
    targetTypeRefEquals(targetType, csharpRuntimeUndefinedTargetType());
}

function planExpectedTypeLiteral(
  node: Node,
  input: CsharpTranslationContext,
  expectedType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (isCsharpFloatLiteralType(expectedType) && HasSourceKind(input.ast, node, KindNumericLiteral)) {
      const value = parseFiniteNumberLiteral(Node_Text(input.ast, AsNumericLiteral(node)));
    if (value === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Numeric literal emission requires parseable finite source literal text from TSTS."));
      return undefined;
    }
    return {
      kind: "NumericLiteralExpression",
      value,
      suffix: expectedType.name === "float" ? "F" : "M",
    };
  }
  if (isCsharpCharType(expectedType)) {
    const text = getStringLiteralText(node, input);
    if (text === undefined) {
      return undefined;
    }
    if (text.length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing."));
      return undefined;
    }
    return { kind: "CharacterLiteralExpression", value: text };
  }
  return undefined;
}

function getStringLiteralText(node: Node, input: CsharpTranslationContext): string | undefined {
  switch (SourceKind(input.ast, node)) {
    case KindStringLiteral:
      return Node_Text(input.ast, AsStringLiteral(node));
    case KindNoSubstitutionTemplateLiteral:
      return Node_Text(input.ast, AsNoSubstitutionTemplateLiteral(node));
    default:
      return undefined;
  }
}

function isCsharpCharType(type: CsharpTypeNode): boolean {
  return type.kind === "PredefinedType" && type.name === "char";
}

function isCsharpFloatLiteralType(type: CsharpTypeNode): type is Extract<CsharpTypeNode, { readonly kind: "PredefinedType" }> {
  return type.kind === "PredefinedType" && (type.name === "float" || type.name === "decimal");
}
