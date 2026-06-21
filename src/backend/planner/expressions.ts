import {
  AsAsExpression,
  AsAwaitExpression,
  AsConditionalExpression,
  AsNewExpression,
  AsNonNullExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
  AsStringLiteral,
  AsSatisfiesExpression,
  AsTemplateExpression,
  AsTemplateSpan,
  AsTypeAssertion,
  KindArrowFunction,
  KindAsExpression,
  KindCallExpression,
  KindClassDeclaration,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindConditionalExpression,
  KindElementAccessExpression,
  KindFalseKeyword,
  KindFunctionExpression,
  KindIdentifier,
  KindNewExpression,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindParenthesizedExpression,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindRegularExpressionLiteral,
  KindStringLiteral,
  KindSatisfiesExpression,
  KindSuperKeyword,
  KindTemplateExpression,
  KindThisKeyword,
  KindTrueKeyword,
  KindTypeOfExpression,
  KindTypeAssertionExpression,
  Node_Text,
  HasSourceKind,
  SourceKind,
} from "./source-ast.js";
import type { ArgumentPassingFact, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  planArrayLiteralExpression,
  planArrayLiteralExpressionFromFacts,
  planTupleLiteralExpression,
} from "./array-literals.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import {
  getCallableSemanticOwnership,
  getProviderOperationOwnership,
  isSourceOwnedProjectConstructibleObjectSubject,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { instantiateSelectedTargetMember } from "./target-member-instantiation.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import { applyTargetConversionFact } from "./target-conversions.js";
import {
  getSourceOwnedUnaryOperator,
  getUnaryOperatorKind,
  planTypeofExpression,
  tryPlanBinaryExpression,
} from "./expression-operators.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import { planObjectLiteralExpressionWithExpectedType } from "./expression-object-literals.js";
import {
  planIdentifierExpression,
} from "./expression-source-references.js";
import {
  planCallExpression,
  planElementAccessExpression,
  planPropertyAccessExpression,
  planSelectedTargetCallArguments,
} from "./expression-target-members.js";
import { isProjectSourceTypeRef } from "./project-source-types.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = planExpressionCore(node, sourceFile, input, diagnostics);
  return applyTargetConversionFact(node, input, diagnostics, expression);
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const defaultValue = input.facts.getDefaultValueFact(node);
  if (defaultValue !== undefined) {
    return {
      kind: "DefaultExpression",
      type: isNode(defaultValue.type)
        ? getCsharpTypeForNode(defaultValue.type, sourceFile, input, undefined, diagnostics)
        : unsupportedFactExpressionType(node, diagnostics),
    };
  }
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing !== undefined && argumentPassing.targetExpression !== node && isNode(argumentPassing.targetExpression)) {
    return planExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics);
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics);
    case KindStringLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsStringLiteral(node)) };
    case KindNoSubstitutionTemplateLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsNoSubstitutionTemplateLiteral(node)) };
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(Node_Text(AsNumericLiteral(node))) };
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTrueKeyword:
      return { kind: "LiteralExpression", value: true };
    case KindFalseKeyword:
      return { kind: "LiteralExpression", value: false };
    case KindNullKeyword:
      return { kind: "LiteralExpression", value: null };
    case KindTypeOfExpression:
      return planTypeofExpression(node, sourceFile, input, diagnostics);
    case KindThisKeyword:
      return { kind: "IdentifierName", name: "this" };
    case KindSuperKeyword:
      return { kind: "IdentifierName", name: "base" };
    case KindAsExpression:
      return planExpression(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindSatisfiesExpression:
      return planExpression(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindNonNullExpression:
      return planExpression(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindTypeAssertionExpression:
      return planExpression(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics);
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)!;
      return {
        kind: "ParenthesizedExpression",
        expression: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrayLiteralExpression: {
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics, {
        planExpression,
        planExpressionWithExpectedType,
      });
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics);
    case KindPropertyAccessExpression:
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindElementAccessExpression:
      return planElementAccessExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics);
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(node)!;
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return invalidExpression("await without expression");
      }
      return {
        kind: "AwaitExpression",
        expression: planExpression(expression.Expression, sourceFile, input, diagnostics),
      };
    }
    case KindCallExpression:
      return planCallExpression(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
    case KindNewExpression: {
      const expression = AsNewExpression(node)!;
      const selectedTargetCall = input.facts.getSelectedTargetCall(node);
      if (selectedTargetCall !== undefined && selectedTargetCall.member.kind !== "constructor") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a provider constructor fact, but provider selected a ${selectedTargetCall.member.kind} member.`));
        return invalidExpression("selected target constructor");
      }
      if (selectedTargetCall === undefined) {
        const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
        const expressionCarrier = getTargetTypeRefForNode(input, node, sourceFile);
        const sourceConstructible = isProjectSourceClassReference(expression.Expression, sourceFile, input) ||
          isSourceOwnedProjectConstructibleObjectSubject(expression.Expression, sourceFile, input) ||
          isProjectSourceTypeRef(expressionCarrier);
        if (!sourceConstructible) {
          pushMissingTargetFactDiagnostic(diagnostics, node, "C# construction emission requires a source-owned constructor or a selected target constructor fact.", {
            requiresTargetFact: true,
            sourceOwned: false,
            reasons: ownership.sourceOwned && ownership.reasons.length === 0 ? ["non-project constructor"] : ownership.reasons,
          });
          return invalidExpression("missing target constructor fact");
        }
      }
      const member = selectedTargetCall === undefined
        ? undefined
        : instantiateSelectedTargetMember(node, selectedTargetCall, diagnostics);
      if (selectedTargetCall !== undefined && member === undefined) {
        return invalidExpression("selected target constructor type arguments");
      }
      const expressionCarrier = getTargetTypeRefForNode(input, node, sourceFile);
      const selectedConstructorTypeRef = member?.returnType ??
        member?.declaringType ??
        expressionCarrier ??
        selectedTargetCall?.member.returnType ??
        selectedTargetCall?.member.declaringType;
      const selectedConstructorType = selectedConstructorTypeRef === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(selectedConstructorTypeRef);
      return {
        kind: "ObjectCreationExpression",
        type: selectedConstructorType ?? getCsharpTypeForNode(node, sourceFile, input, undefined, diagnostics),
        arguments: member === undefined
          ? (expression.Arguments?.Nodes ?? [])
            .filter((argument): argument is Node => argument !== undefined)
            .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics))
          : planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics, planCallArgument),
      };
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      return {
        kind: "ConditionalExpression",
        condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
        whenTrue: planExpression(expression.WhenTrue!, sourceFile, input, diagnostics),
        whenFalse: planExpression(expression.WhenFalse!, sourceFile, input, diagnostics),
      };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node)!;
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
      if (operator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a selected provider operator fact.", ownership);
        return invalidExpression("missing target prefix operator fact");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target prefix operator");
      }
      return {
        kind: "PrefixUnaryExpression",
        operator,
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
      };
    }
    case KindPostfixUnaryExpression: {
      const expression = AsPostfixUnaryExpression(node)!;
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
      if (operator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a selected provider operator fact.", ownership);
        return invalidExpression("missing target postfix operator fact");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target postfix operator");
      }
      return {
        kind: "PostfixUnaryExpression",
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
        operator,
      };
    }
    default: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, planExpression);
      if (binary !== undefined) {
        return binary;
      }
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return invalidExpression("unsupported expression");
    }
  }
}

function isProjectSourceClassReference(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const reference = input.semantics.getProjectSourceReferenceForNode(node, { sourceFile });
  if (reference === undefined || input.facts.getTargetBindingFact(reference.symbol) !== undefined) {
    return false;
  }
  const fileName = input.ast.getFileName(reference.sourceFile);
  return !reference.sourceFile.IsDeclarationFile &&
    !fileName.startsWith("tsts-provider://") &&
    input.ast.kindName(reference.declaration) === KindClassDeclaration;
}

export function planCallArgument(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): CsharpArgument {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, expectedType) };
  }
  if (!isNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, expectedType) };
  }
  return {
    kind: "Argument",
    expression: planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, expectedType),
    passing: getCsharpArgumentPassing(argumentPassing.mode),
  };
}

function planCallArgumentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): CsharpExpression {
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion?.operation !== undefined) {
    return planExpression(node, sourceFile, input, diagnostics);
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType);
  }
  if (conversion?.convertedType !== undefined) {
    const convertedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (convertedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return invalidExpression("target argument conversion type");
    }
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, convertedType);
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsTemplateExpression(node)!;
  const parts: CsharpInterpolatedStringPart[] = [
    { kind: "InterpolatedStringText", text: Node_Text(expression.Head) },
  ];
  for (const spanNode of expression.TemplateSpans?.Nodes ?? []) {
    if (spanNode === undefined) {
      continue;
    }
    const span = AsTemplateSpan(spanNode)!;
    parts.push({
      kind: "Interpolation",
      expression: planExpression(span.Expression!, sourceFile, input, diagnostics),
    });
    parts.push({ kind: "InterpolatedStringText", text: Node_Text(span.Literal) });
  }
  return { kind: "InterpolatedStringExpression", parts };
}

function getCsharpArgumentPassing(mode: ArgumentPassingFact["mode"]): CsharpArgument["passing"] {
  switch (mode) {
    case "byref-writeonly-must-init":
      return "out";
    case "byref-readwrite":
      return "ref";
    case "byref-readonly":
      return "in";
    default:
      return undefined;
  }
}

export function planExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
): CsharpExpression {
  const expectedTypeLiteral = planExpectedTypeLiteral(node, input, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedTypeLiteral;
  }
  if (HasSourceKind(input.ast, node, KindAsExpression)) {
    return planExpressionWithExpectedType(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindSatisfiesExpression)) {
    return planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindNonNullExpression)) {
    return planExpressionWithExpectedType(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindTypeAssertionExpression)) {
    return planExpressionWithExpectedType(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindParenthesizedExpression)) {
    const expression = AsParenthesizedExpression(node)!;
    return {
      kind: "ParenthesizedExpression",
      expression: planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  if (HasSourceKind(input.ast, node, KindArrowFunction)) {
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    return planObjectLiteralExpressionWithExpectedType(
      node,
      sourceFile,
      input,
      diagnostics,
      expectedType,
      expectedTypeSubject,
      planExpression,
      planExpressionWithExpectedType,
    );
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, {
      planExpression,
      planExpressionWithExpectedType,
    });
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType, {
      planExpression,
      planExpressionWithExpectedType,
    });
  }
  if (HasSourceKind(input.ast, node, KindConditionalExpression)) {
    const expression = AsConditionalExpression(node)!;
    return {
      kind: "ConditionalExpression",
      condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
      whenTrue: planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
      whenFalse: planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

function planExpectedTypeLiteral(
  node: Node,
  input: TargetCompileInput,
  expectedType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (!isCsharpCharType(expectedType)) {
    return undefined;
  }
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

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly Kind?: unknown }).Kind === "number";
}

function unsupportedFactExpressionType(node: Node, diagnostics: TargetDiagnostic[]): CsharpTypeNode {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Source fact type subject must be an AST type node before C# expression emission."));
  return { kind: "InvalidType", reason: "source fact expression type" };
}
