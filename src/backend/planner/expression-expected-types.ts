import {
  AsAsExpression,
  AsConditionalExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNonNullExpression,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsSatisfiesExpression,
  AsStringLiteral,
  AsTypeAssertion,
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
import type { TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
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
  targetTypeRefsMatch,
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
  requireCsharpBoolRuntimeCarrier,
} from "./expression-bool-carriers.js";
import {
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  getCsharpRuntimeUnionArms,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  isTstsUndefinedType,
} from "../../source/csharp-source-semantics/nullish-types.js";

export interface ExpectedTypeExpressionPlanners {
  readonly planExpression: ExpressionPlanner;
  readonly planExpressionWithExpectedType: ExpectedExpressionPlanner;
}

export function planExpressionWithExpectedTypeCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planners: ExpectedTypeExpressionPlanners,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expectedRuntimeNullishLiteral = planExpectedRuntimeNullishLiteral(node, sourceFile, input, expectedTargetType, expectedTypeSubject);
  if (expectedRuntimeNullishLiteral !== undefined) {
    return expectedRuntimeNullishLiteral;
  }
  const expectedTypeLiteral = planExpectedTypeLiteral(node, input, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedTypeLiteral;
  }
  if (HasSourceKind(input.ast, node, KindAsExpression)) {
    return planners.planExpressionWithExpectedType(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
  }
  if (HasSourceKind(input.ast, node, KindSatisfiesExpression)) {
    return planners.planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
  }
  if (HasSourceKind(input.ast, node, KindNonNullExpression)) {
    return planners.planExpressionWithExpectedType(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
  }
  if (HasSourceKind(input.ast, node, KindTypeAssertionExpression)) {
    return planners.planExpressionWithExpectedType(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
  }
  if (HasSourceKind(input.ast, node, KindParenthesizedExpression)) {
    const expression = AsParenthesizedExpression(node)!;
    const inner = planners.planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    if (inner === undefined) {
      return undefined;
    }
    return {
      kind: "ParenthesizedExpression",
      expression: inner,
    };
  }
  if (HasSourceKind(input.ast, node, KindArrowFunction)) {
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planners.planExpression, expectedType, undefined, expectedTargetType, planners.planExpressionWithExpectedType);
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, undefined, expectedTargetType);
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    const dictionaryDiagnosticsStart = diagnostics.length;
    const dictionaryLiteral = tryPlanRecordDictionaryLiteralWithExpectedType(node, sourceFile, input, diagnostics, expectedTypeSubject, planners.planExpressionWithExpectedType);
    if (dictionaryLiteral !== undefined) {
      return dictionaryLiteral;
    }
    if (diagnostics.length > dictionaryDiagnosticsStart) {
      return undefined;
    }
    return planObjectLiteralExpressionWithExpectedType(
      node,
      sourceFile,
      input,
      diagnostics,
      expectedType,
      expectedTypeSubject,
      planners.planExpression,
      planners.planExpressionWithExpectedType,
      expectedTargetType,
    );
  }
  if (expectedType.kind === "NullableType" && !HasSourceKind(input.ast, node, KindNullKeyword)) {
    return planners.planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType.inner, expectedTypeSubject, expectedTargetType);
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
      planners.planExpression,
      planners.planExpressionWithExpectedType,
    );
    if (binaryExpression !== undefined) {
      return binaryExpression;
    }
    if (diagnostics.length > binaryDiagnosticsStart) {
      return undefined;
    }
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planners, csharpTypeFromTargetTypeRef(expectedTargetType));
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planners, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType, planners);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType !== undefined && expectedTargetType.kind !== "array" && expectedTargetType.kind !== "tuple") {
    return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTargetType?.kind === "array") {
    return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedTargetType, planners);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedTypeSubject !== undefined) {
    const expectedCarrier = getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
    if (expectedCarrier !== undefined && expectedCarrier.kind !== "array" && expectedCarrier.kind !== "tuple") {
      return planArrayLiteralExpressionWithCarrier(node, sourceFile, input, diagnostics, expectedCarrier, planners);
    }
  }
  if (HasSourceKind(input.ast, node, KindConditionalExpression)) {
    const expression = AsConditionalExpression(node)!;
    if (expression.Condition === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Conditional expression requires a condition expression."));
      return undefined;
    }
    if (!requireCsharpBoolRuntimeCarrier(expression.Condition, "Conditional expression condition", sourceFile, input, diagnostics)) {
      return undefined;
    }
    const condition = planners.planExpression(expression.Condition!, sourceFile, input, diagnostics);
    const whenTrue = planners.planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    const whenFalse = planners.planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, expectedTargetType);
    if (condition === undefined || whenTrue === undefined || whenFalse === undefined) {
      return undefined;
    }
    return {
      kind: "ConditionalExpression",
      condition,
      whenTrue,
      whenFalse,
    };
  }
  return planners.planExpression(node, sourceFile, input, diagnostics);
}

function planExpectedRuntimeNullishLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
  return targetTypeRefsMatch(expectedTargetType, carrier) ||
    (getCsharpRuntimeUnionArms(expectedTargetType)?.some((arm) => targetTypeRefsMatch(arm, carrier)) === true);
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
  input: TargetCompileInput,
): boolean {
  if (SourceKind(input.ast, node) !== KindIdentifier || Node_Text(node) !== "undefined") {
    return false;
  }
  if (
    input.analysis.getProjectSourceReferenceForNode(node, { sourceFile }) !== undefined ||
    input.targetFacts.getTargetBindingForReference(node, { sourceFile }) !== undefined
  ) {
    return false;
  }
  return isTstsUndefinedType(input.analysis.getTypeAtLocation(node, { sourceFile }), input.types);
}

function planExpectedTypeLiteral(
  node: Node,
  input: TargetCompileInput,
  expectedType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (isCsharpFloatLiteralType(expectedType) && HasSourceKind(input.ast, node, KindNumericLiteral)) {
      const value = parseFiniteNumberLiteral(Node_Text(AsNumericLiteral(node)));
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

function getStringLiteralText(node: Node, input: TargetCompileInput): string | undefined {
  switch (SourceKind(input.ast, node)) {
    case KindStringLiteral:
      return Node_Text(AsStringLiteral(node));
    case KindNoSubstitutionTemplateLiteral:
      return Node_Text(AsNoSubstitutionTemplateLiteral(node));
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
