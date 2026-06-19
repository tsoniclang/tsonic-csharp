import {
  AsArrayLiteralExpression,
  AsArrowFunction,
  AsAsExpression,
  AsBinaryExpression,
  AsCallExpression,
  AsConditionalExpression,
  AsElementAccessExpression,
  AsFunctionExpression,
  AsIdentifier,
  AsNewExpression,
  AsNonNullExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNumericLiteral,
  AsObjectLiteralExpression,
  AsParameterDeclaration,
  AsParenthesizedExpression,
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
  AsPropertyAssignment,
  AsPropertyAccessExpression,
  AsShorthandPropertyAssignment,
  AsStringLiteral,
  AsSatisfiesExpression,
  AsTemplateExpression,
  AsTemplateSpan,
  AsTypeAssertion,
  KindAmpersandAmpersandToken,
  KindAmpersandEqualsToken,
  KindAmpersandToken,
  KindArrowFunction,
  KindAsExpression,
  KindAsteriskEqualsToken,
  KindAsteriskToken,
  KindBarBarToken,
  KindBarEqualsToken,
  KindBarToken,
  KindBinaryExpression,
  KindBlock,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindConditionalExpression,
  KindElementAccessExpression,
  KindEqualsEqualsEqualsToken,
  KindEqualsEqualsToken,
  KindEqualsToken,
  KindExclamationEqualsEqualsToken,
  KindExclamationEqualsToken,
  KindExclamationToken,
  KindFalseKeyword,
  KindFunctionExpression,
  KindCaretEqualsToken,
  KindCaretToken,
  KindGreaterThanEqualsToken,
  KindGreaterThanGreaterThanEqualsToken,
  KindGreaterThanGreaterThanGreaterThanEqualsToken,
  KindGreaterThanGreaterThanGreaterThanToken,
  KindGreaterThanGreaterThanToken,
  KindGreaterThanToken,
  KindIdentifier,
  KindLessThanEqualsToken,
  KindLessThanLessThanEqualsToken,
  KindLessThanLessThanToken,
  KindLessThanToken,
  KindMinusMinusToken,
  KindMinusEqualsToken,
  KindMinusToken,
  KindNewExpression,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindParenthesizedExpression,
  KindPercentEqualsToken,
  KindPercentToken,
  KindPlusPlusToken,
  KindPlusEqualsToken,
  KindPlusToken,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAssignment,
  KindPropertyAccessExpression,
  KindQuestionQuestionToken,
  KindSlashEqualsToken,
  KindSlashToken,
  KindStringLiteral,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindSatisfiesExpression,
  KindSuperKeyword,
  KindTemplateExpression,
  KindThisKeyword,
  KindTildeToken,
  KindTrueKeyword,
  KindTypeAssertionExpression,
  Node_Text,
} from "@tsonic/tsts";
import type { ArgumentPassingFact, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../ast/csharp-ast.js";
import { expressionToCsharpType, getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planBlockStatements } from "./statements.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const defaultValue = input.facts.getDefaultValueFact(node);
  if (defaultValue !== undefined) {
    return {
      kind: "default",
      type: isNode(defaultValue.type)
        ? getCsharpTypeForNode(defaultValue.type, sourceFile, input, undefined, diagnostics)
        : unsupportedFactExpressionType(node, diagnostics),
    };
  }
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing !== undefined && argumentPassing.targetExpression !== node && isNode(argumentPassing.targetExpression)) {
    return planExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics);
  }
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "identifier", name: sanitizeIdentifier(AsIdentifier(node)!.Text) };
    case KindStringLiteral:
      return { kind: "literal", value: AsStringLiteral(node)!.Text };
    case KindNoSubstitutionTemplateLiteral:
      return { kind: "literal", value: AsNoSubstitutionTemplateLiteral(node)!.Text };
    case KindNumericLiteral:
      return { kind: "literal", value: Number(AsNumericLiteral(node)!.Text) };
    case KindTrueKeyword:
      return { kind: "literal", value: true };
    case KindFalseKeyword:
      return { kind: "literal", value: false };
    case KindNullKeyword:
      return { kind: "literal", value: null };
    case KindThisKeyword:
      return { kind: "identifier", name: "this" };
    case KindSuperKeyword:
      return { kind: "identifier", name: "base" };
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
        kind: "parenthesized",
        expression: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrayLiteralExpression: {
      const expression = AsArrayLiteralExpression(node)!;
      return {
        kind: "array",
        elements: (expression.Elements?.Nodes ?? [])
          .filter((element): element is Node => element !== undefined)
          .map((element) => planExpression(element, sourceFile, input, diagnostics)),
      };
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics);
    case KindPropertyAccessExpression: {
      const expression = AsPropertyAccessExpression(node)!;
      return {
        kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
        receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        name: sanitizeIdentifier(Node_Text(expression.name!)),
      };
    }
    case KindElementAccessExpression: {
      const expression = AsElementAccessExpression(node)!;
      return {
        kind: expression.QuestionDotToken === undefined ? "element" : "optionalElement",
        receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics);
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics);
    case KindCallExpression: {
      const expression = AsCallExpression(node)!;
      return {
        kind: "call",
        callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        arguments: (expression.Arguments?.Nodes ?? [])
          .filter((argument): argument is Node => argument !== undefined)
          .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
      };
    }
    case KindNewExpression: {
      const expression = AsNewExpression(node)!;
      return {
        kind: "new",
        type: expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics),
        arguments: (expression.Arguments?.Nodes ?? [])
          .filter((argument): argument is Node => argument !== undefined)
          .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
      };
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      return {
        kind: "conditional",
        condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
        whenTrue: planExpression(expression.WhenTrue!, sourceFile, input, diagnostics),
        whenFalse: planExpression(expression.WhenFalse!, sourceFile, input, diagnostics),
      };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node)!;
      const operator = getCsharpPrefixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Prefix unary operator is outside the current C# planning surface."));
        return invalidExpression("unsupported prefix unary operator");
      }
      return {
        kind: "prefixUnary",
        operator,
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
      };
    }
    case KindPostfixUnaryExpression: {
      const expression = AsPostfixUnaryExpression(node)!;
      const operator = getCsharpPostfixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Postfix unary operator is outside the current C# planning surface."));
        return invalidExpression("unsupported postfix unary operator");
      }
      return {
        kind: "postfixUnary",
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
        operator,
      };
    }
    default: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics);
      if (binary !== undefined) {
        return binary;
      }
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return invalidExpression("unsupported expression");
    }
  }
}

function invalidExpression(reason: string): CsharpExpression {
  return { kind: "invalid", reason };
}

function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsArrowFunction(node)!;
  if (expression.Body?.Kind === KindBlock) {
    return {
      kind: "lambda",
      parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
      body: {
        statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics),
      },
    };
  }
  return {
    kind: "lambda",
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: planExpression(expression.Body!, sourceFile, input, diagnostics),
  };
}

function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsFunctionExpression(node)!;
  return {
    kind: "lambda",
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics),
    },
  };
}

function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpLambdaParameter[] {
  return parameterNodes
    .filter((parameterNode): parameterNode is Node => parameterNode !== undefined)
    .map((parameterNode): CsharpLambdaParameter => {
      const parameter = AsParameterDeclaration(parameterNode)!;
      if (parameter.DotDotDotToken !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameterNode, "Rest parameters in lambdas require target delegate facts before C# emission."));
      }
      if (parameter.name?.Kind !== KindIdentifier) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode, "Lambda parameter binding is outside the current C# planning surface."));
      }
      return {
        name: parameter.name?.Kind === KindIdentifier ? sanitizeIdentifier(Node_Text(parameter.name)) : "arg",
        ...(parameter.Type === undefined ? {} : { type: getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics) }),
      };
    });
}

export function planCallArgument(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpArgument {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    return { expression: planExpression(node, sourceFile, input, diagnostics) };
  }
  if (!isNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return { expression: planExpression(node, sourceFile, input, diagnostics) };
  }
  return {
    expression: planExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics),
    passing: getCsharpArgumentPassing(argumentPassing.mode),
  };
}

function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsTemplateExpression(node)!;
  const parts: CsharpInterpolatedStringPart[] = [
    { kind: "text", text: Node_Text(expression.Head) },
  ];
  for (const spanNode of expression.TemplateSpans?.Nodes ?? []) {
    if (spanNode === undefined) {
      continue;
    }
    const span = AsTemplateSpan(spanNode)!;
    parts.push({
      kind: "expression",
      expression: planExpression(span.Expression!, sourceFile, input, diagnostics),
    });
    parts.push({ kind: "text", text: Node_Text(span.Literal) });
  }
  return { kind: "interpolatedString", parts };
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
): CsharpExpression {
  if (node.Kind === KindObjectLiteralExpression && isObjectInitializerTargetType(expectedType)) {
    return planObjectInitializerExpression(node, expectedType, sourceFile, input, diagnostics);
  }
  if (node.Kind === KindArrayLiteralExpression && expectedType.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics);
  }
  if (node.Kind === KindConditionalExpression) {
    const expression = AsConditionalExpression(node)!;
    return {
      kind: "conditional",
      condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
      whenTrue: planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType),
      whenFalse: planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType),
    };
  }
  const expression = planExpression(node, sourceFile, input, diagnostics);
  if (expression.kind === "array" && expectedType.kind === "array") {
    return {
      ...expression,
      elementType: expectedType.elementType,
    };
  }
  return expression;
}

function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const literal = AsArrayLiteralExpression(node)!;
  return {
    kind: "tuple",
    elements: (literal.Elements?.Nodes ?? [])
      .filter((element): element is Node => element !== undefined)
      .map((element) => planExpression(element, sourceFile, input, diagnostics)),
  };
}

function planObjectInitializerExpression(
  node: Node,
  expectedType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const literal = AsObjectLiteralExpression(node)!;
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const property of literal.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    switch (property.Kind) {
      case KindPropertyAssignment: {
        const assignment = AsPropertyAssignment(property)!;
        const name = getObjectInitializerPropertyName(assignment.name, diagnostics, property);
        if (name !== undefined) {
          assignments.push({
            name,
            expression: planExpression(assignment.Initializer!, sourceFile, input, diagnostics),
          });
        }
        break;
      }
      case KindShorthandPropertyAssignment: {
        const assignment = AsShorthandPropertyAssignment(property)!;
        const name = sanitizeIdentifier(Node_Text(assignment.name));
        assignments.push({
          name,
          expression: { kind: "identifier", name },
        });
        break;
      }
      case KindSpreadAssignment:
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object spread requires finalized target object-copy semantics before C# emission."));
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# object-initializer surface."));
        break;
    }
  }
  return {
    kind: "objectInitializer",
    type: expectedType,
    assignments,
  };
}

function isObjectInitializerTargetType(type: CsharpTypeNode): boolean {
  return type.kind === "named" || type.kind === "qualified";
}

function getObjectInitializerPropertyName(
  node: Node | undefined,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): string | undefined {
  switch (node?.Kind) {
    case KindIdentifier:
      return sanitizeIdentifier(Node_Text(node));
    case KindStringLiteral: {
      const name = AsStringLiteral(node)!.Text;
      if (sanitizeIdentifier(name) === name) {
        return name;
      }
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "String-literal object initializer keys require direct C# member names."));
      return undefined;
    }
    default:
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "Object initializer keys require identifier or direct string-literal member names."));
      return undefined;
  }
}

function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const operator = getCsharpBinaryOperator(node);
  if (operator === undefined) {
    return undefined;
  }
  const expression = AsBinaryExpression(node)!;
  return {
    kind: "binary",
    left: planExpression(expression.Left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(expression.Right!, sourceFile, input, diagnostics),
  };
}

function getCsharpBinaryOperator(node: Node): string | undefined {
  if (node.Kind === KindBinaryExpression) {
    const operatorKind = AsBinaryExpression(node)!.OperatorToken?.Kind;
    switch (operatorKind) {
      case KindPlusToken:
        return "+";
      case KindMinusToken:
        return "-";
      case KindAsteriskToken:
        return "*";
      case KindSlashToken:
        return "/";
      case KindPercentToken:
        return "%";
      case KindPlusEqualsToken:
        return "+=";
      case KindMinusEqualsToken:
        return "-=";
      case KindAsteriskEqualsToken:
        return "*=";
      case KindSlashEqualsToken:
        return "/=";
      case KindPercentEqualsToken:
        return "%=";
      case KindQuestionQuestionToken:
        return "??";
      case KindEqualsToken:
        return "=";
      case KindEqualsEqualsToken:
      case KindEqualsEqualsEqualsToken:
        return "==";
      case KindExclamationEqualsToken:
      case KindExclamationEqualsEqualsToken:
        return "!=";
      case KindLessThanToken:
        return "<";
      case KindLessThanEqualsToken:
        return "<=";
      case KindGreaterThanToken:
        return ">";
      case KindGreaterThanEqualsToken:
        return ">=";
      case KindAmpersandAmpersandToken:
        return "&&";
      case KindBarBarToken:
        return "||";
      case KindAmpersandToken:
        return "&";
      case KindBarToken:
        return "|";
      case KindCaretToken:
        return "^";
      case KindLessThanLessThanToken:
        return "<<";
      case KindGreaterThanGreaterThanToken:
        return ">>";
      case KindGreaterThanGreaterThanGreaterThanToken:
        return ">>>";
      case KindAmpersandEqualsToken:
        return "&=";
      case KindBarEqualsToken:
        return "|=";
      case KindCaretEqualsToken:
        return "^=";
      case KindLessThanLessThanEqualsToken:
        return "<<=";
      case KindGreaterThanGreaterThanEqualsToken:
        return ">>=";
      case KindGreaterThanGreaterThanGreaterThanEqualsToken:
        return ">>>=";
      default:
        return undefined;
    }
  }
  return undefined;
}

function getCsharpPrefixUnaryOperator(kind: number): string | undefined {
  switch (kind) {
    case KindPlusToken:
      return "+";
    case KindMinusToken:
      return "-";
    case KindExclamationToken:
      return "!";
    case KindTildeToken:
      return "~";
    case KindPlusPlusToken:
      return "++";
    case KindMinusMinusToken:
      return "--";
    default:
      return undefined;
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly Kind?: unknown }).Kind === "number";
}

function unsupportedFactExpressionType(node: Node, diagnostics: TargetDiagnostic[]): CsharpTypeNode {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Source fact type subject must be an AST type node before C# expression emission."));
  return { kind: "predefined", name: "object" };
}

function getCsharpPostfixUnaryOperator(kind: number): string | undefined {
  switch (kind) {
    case KindPlusPlusToken:
      return "++";
    case KindMinusMinusToken:
      return "--";
    default:
      return undefined;
  }
}
