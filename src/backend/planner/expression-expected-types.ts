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
  KindConditionalExpression,
  KindFunctionExpression,
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
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  planArrayLiteralExpression,
  planTupleLiteralExpression,
} from "./array-literals.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
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

export interface ExpectedTypeExpressionPlanners {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
    expectedTypeSubject?: Node,
  ) => CsharpExpression;
}

export function planExpressionWithExpectedTypeCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planners: ExpectedTypeExpressionPlanners,
): CsharpExpression {
  const expectedTypeLiteral = planExpectedTypeLiteral(node, input, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedTypeLiteral;
  }
  if (HasSourceKind(input.ast, node, KindAsExpression)) {
    return planners.planExpressionWithExpectedType(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindSatisfiesExpression)) {
    return planners.planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindNonNullExpression)) {
    return planners.planExpressionWithExpectedType(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindTypeAssertionExpression)) {
    return planners.planExpressionWithExpectedType(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindParenthesizedExpression)) {
    const expression = AsParenthesizedExpression(node)!;
    return {
      kind: "ParenthesizedExpression",
      expression: planners.planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  if (HasSourceKind(input.ast, node, KindArrowFunction)) {
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planners.planExpression, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    const dictionaryLiteral = tryPlanRecordDictionaryLiteralWithExpectedType(node, sourceFile, input, diagnostics, expectedTypeSubject);
    if (dictionaryLiteral !== undefined) {
      return dictionaryLiteral;
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
    );
  }
  if (expectedType.kind === "NullableType" && !HasSourceKind(input.ast, node, KindNullKeyword)) {
    return planners.planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType.inner, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planners);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType, planners);
  }
  if (HasSourceKind(input.ast, node, KindConditionalExpression)) {
    const expression = AsConditionalExpression(node)!;
    return {
      kind: "ConditionalExpression",
      condition: planners.planExpression(expression.Condition!, sourceFile, input, diagnostics),
      whenTrue: planners.planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
      whenFalse: planners.planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  return planners.planExpression(node, sourceFile, input, diagnostics);
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
      return invalidExpression("invalid numeric literal");
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
      return invalidExpression("invalid char literal");
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
