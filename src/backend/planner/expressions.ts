import {
  AsArrayLiteralExpression,
  AsArrowFunction,
  AsAsExpression,
  AsAwaitExpression,
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
  AsParameterDeclaration,
  AsParenthesizedExpression,
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
  AsPropertyAccessExpression,
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
  KindAwaitExpression,
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
  KindInstanceOfKeyword,
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
  KindPropertyAccessExpression,
  KindQuestionQuestionToken,
  KindSlashEqualsToken,
  KindSlashToken,
  KindStringLiteral,
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
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpTypeNode } from "../ast/csharp-ast.js";
import { expressionToCsharpType, getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, diagnoseUnsupportedAsyncSemantics } from "./modifiers.js";
import { getCallableSemanticOwnership, getProviderOperationOwnership, getSemanticOwnership, pushMissingTargetFactDiagnostic } from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
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
      diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires an expected target array or tuple type from TSTS/provider facts before C# emission."));
      return invalidExpression("array literal without expected target type");
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics);
    case KindPropertyAccessExpression: {
      const expression = AsPropertyAccessExpression(node)!;
      const name = getCsharpPropertyAccessName(node, expression.Expression, Node_Text(expression.name!), sourceFile, input, diagnostics);
      if (name === undefined) {
        return invalidExpression("missing target property fact");
      }
      return {
        kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
        receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        name,
      };
    }
    case KindElementAccessExpression: {
      const expression = AsElementAccessExpression(node)!;
      if (!ensureElementAccessCanBeRendered(node, expression.Expression, sourceFile, input, diagnostics)) {
        return invalidExpression("missing target element access fact");
      }
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
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(node)!;
      diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression requires finalized TSTS/provider async lowering facts before C# emission."));
      return invalidExpression(expression.Expression === undefined
        ? "await without expression"
        : "await without async lowering facts");
    }
    case KindCallExpression:
      return planCallExpression(node, sourceFile, input, diagnostics);
    case KindNewExpression: {
      const expression = AsNewExpression(node)!;
      const selectedTargetCall = input.facts.getSelectedTargetCall(node);
      if (selectedTargetCall !== undefined && selectedTargetCall.member.kind !== "constructor") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a provider constructor fact, but provider selected a ${selectedTargetCall.member.kind} member.`));
        return invalidExpression("selected target constructor");
      }
      if (selectedTargetCall === undefined) {
        const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
        if (ownership.requiresTargetFact || !ownership.sourceOwned) {
          pushMissingTargetFactDiagnostic(diagnostics, node, "C# construction emission requires a source-owned constructor or a selected target constructor fact.", ownership);
          return invalidExpression("missing target constructor fact");
        }
      }
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
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getCsharpPrefixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Prefix unary operator is outside the current C# planning surface."));
        return invalidExpression("unsupported prefix unary operator");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target prefix operator");
      }
      if (selectedOperator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        const directOperator = isDirectCsharpPrefixUnaryOperatorAllowed(expression.Operator, expression.Operand, ownership);
        if (ownership.requiresTargetFact || !directOperator.allowed) {
          pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a direct primitive/source-owned operation or a selected provider operator fact.", withDirectOperatorReason(ownership, directOperator.reason));
          return invalidExpression("missing target prefix operator fact");
        }
      }
      return {
        kind: "prefixUnary",
        operator,
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
      };
    }
    case KindPostfixUnaryExpression: {
      const expression = AsPostfixUnaryExpression(node)!;
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getCsharpPostfixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Postfix unary operator is outside the current C# planning surface."));
        return invalidExpression("unsupported postfix unary operator");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target postfix operator");
      }
      if (selectedOperator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        const directOperator = isDirectCsharpPostfixUnaryOperatorAllowed(expression.Operator, expression.Operand, ownership);
        if (ownership.requiresTargetFact || !directOperator.allowed) {
          pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a direct primitive/source-owned operation or a selected provider operator fact.", withDirectOperatorReason(ownership, directOperator.reason));
          return invalidExpression("missing target postfix operator fact");
        }
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

function getCsharpPropertyAccessName(
  propertyAccess: Node,
  receiver: Node | undefined,
  sourceName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    return targetOperation.targetOperation;
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return undefined;
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return undefined;
  }
  return sanitizeIdentifier(sourceName);
}

function ensureElementAccessCanBeRendered(
  elementAccess: Node,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): boolean {
  const targetOperation = input.facts.getSelectedTargetElementAccess(elementAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "indexer") {
    return true;
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Element access expected a provider indexer fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return false;
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, elementAccess, "C# element access must be selected by TSTS/provider facts before emission.", ownership);
    return false;
  }
  return true;
}

function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsCallExpression(node)!;
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    return {
      kind: "call",
      callee: planSelectedTargetCallee(expression.Expression, selectedTargetCall.member.targetName, sourceFile, input, diagnostics),
      arguments: (expression.Arguments?.Nodes ?? [])
        .filter((argument): argument is Node => argument !== undefined)
        .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
    };
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return invalidExpression("missing target call fact");
  }
  return {
    kind: "call",
    callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    arguments: (expression.Arguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
  };
}

function planSelectedTargetCallee(
  callee: Node | undefined,
  targetName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (callee?.Kind === KindPropertyAccessExpression) {
    const property = AsPropertyAccessExpression(callee)!;
    return {
      kind: property.QuestionDotToken === undefined ? "member" : "optionalMember",
      receiver: planExpression(property.Expression!, sourceFile, input, diagnostics),
      name: sanitizeIdentifier(targetName),
    };
  }
  if (callee?.Kind === KindIdentifier) {
    return {
      kind: "identifier",
      name: sanitizeIdentifier(targetName),
    };
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message: "Selected target call requires an identifier or property-access callee before C# emission.",
  });
  return invalidExpression("selected target call callee");
}

function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsArrowFunction(node)!;
  diagnoseUnsupportedAsyncSemantics(node, "arrow function", diagnostics);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics);
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
  diagnoseUnsupportedAsyncSemantics(node, "function expression", diagnostics);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics);
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
      diagnoseTypeScriptOnlyRuntimeShapeModifiers(parameterNode, "lambda parameter declaration", diagnostics);
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

function diagnoseMissingLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  if (input.facts.getContextualTargetTypeFact(node)?.targetType !== undefined) {
    return;
  }
  if (input.checker.getContextualType(node, undefined, { sourceFile }) !== undefined) {
    return;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Lambda emission requires a contextual function/delegate type from TSTS or provider facts before C# emission."));
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
  const expectedTypeLiteral = planExpectedTypeLiteral(node, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedTypeLiteral;
  }
  if (node.Kind === KindAsExpression) {
    return planExpressionWithExpectedType(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindSatisfiesExpression) {
    return planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindNonNullExpression) {
    return planExpressionWithExpectedType(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindTypeAssertionExpression) {
    return planExpressionWithExpectedType(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindParenthesizedExpression) {
    const expression = AsParenthesizedExpression(node)!;
    return {
      kind: "parenthesized",
      expression: planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType),
    };
  }
  if (node.Kind === KindObjectLiteralExpression) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires finalized TSTS/provider object-shape facts before C# emission."));
    return invalidExpression("object literal without finalized object-shape facts");
  }
  if (node.Kind === KindArrayLiteralExpression && expectedType.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics);
  }
  if (node.Kind === KindArrayLiteralExpression && expectedType.kind === "array") {
    return planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType);
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
  return planExpression(node, sourceFile, input, diagnostics);
}

function planExpectedTypeLiteral(
  node: Node,
  expectedType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (!isCsharpCharType(expectedType)) {
    return undefined;
  }
  const text = getStringLiteralText(node);
  if (text === undefined) {
    return undefined;
  }
  if (text.length !== 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing."));
    return invalidExpression("invalid char literal");
  }
  return { kind: "charLiteral", value: text };
}

function getStringLiteralText(node: Node): string | undefined {
  switch (node.Kind) {
    case KindStringLiteral:
      return AsStringLiteral(node)!.Text;
    case KindNoSubstitutionTemplateLiteral:
      return AsNoSubstitutionTemplateLiteral(node)!.Text;
    default:
      return undefined;
  }
}

function isCsharpCharType(type: CsharpTypeNode): boolean {
  return type.kind === "predefined" && type.name === "char";
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

function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
): CsharpExpression {
  const literal = AsArrayLiteralExpression(node)!;
  return {
    kind: "array",
    elementType,
    elements: (literal.Elements?.Nodes ?? [])
      .filter((element): element is Node => element !== undefined)
      .map((element) => planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType)),
  };
}

function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const operator = selectedOperator?.operationKind === "operator"
    ? selectedOperator.targetOperation
    : getCsharpBinaryOperator(node);
  if (operator === undefined) {
    return undefined;
  }
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target operator");
  }
  const expression = AsBinaryExpression(node)!;
  const operatorKind = expression.OperatorToken?.Kind;
  if (selectedOperator === undefined && operator !== "=") {
    const leftOwnership = getProviderOperationOwnership(expression.Left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(expression.Right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    const directOperator = isDirectCsharpBinaryOperatorAllowed(operatorKind, expression.Left, expression.Right, leftOwnership, rightOwnership);
    if (ownership.requiresTargetFact || !directOperator.allowed) {
      pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a direct primitive/source-owned operation or a selected provider operator fact.", withDirectOperatorReason(ownership, directOperator.reason));
      return invalidExpression("missing target operator fact");
    }
  }
  return {
    kind: "binary",
    left: planExpression(expression.Left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(expression.Right!, sourceFile, input, diagnostics),
  };
}

function combineOwnership(left: OperationSemanticOwnership, right: OperationSemanticOwnership): OperationSemanticOwnership {
  const reasons = [...left.reasons, ...right.reasons];
  return {
    requiresTargetFact: left.requiresTargetFact || right.requiresTargetFact,
    sourceOwned: left.sourceOwned && right.sourceOwned,
    reasons,
    sourcePrimitive: left.sourcePrimitive ?? right.sourcePrimitive,
    typeFlags: {
      stringLike: left.typeFlags.stringLike || right.typeFlags.stringLike,
      numberLike: left.typeFlags.numberLike || right.typeFlags.numberLike,
      booleanLike: left.typeFlags.booleanLike || right.typeFlags.booleanLike,
      bigintLike: left.typeFlags.bigintLike || right.typeFlags.bigintLike,
      enumLike: left.typeFlags.enumLike || right.typeFlags.enumLike,
      typeParameter: left.typeFlags.typeParameter || right.typeFlags.typeParameter,
    },
  };
}

interface DirectOperatorDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

function isDirectCsharpBinaryOperatorAllowed(
  operatorKind: number | undefined,
  leftNode: Node | undefined,
  rightNode: Node | undefined,
  left: OperationSemanticOwnership,
  right: OperationSemanticOwnership,
): DirectOperatorDecision {
  switch (operatorKind) {
    case KindAmpersandAmpersandToken:
    case KindBarBarToken:
      return directDecision(isBooleanOperand(left) && isBooleanOperand(right), "logical operators require boolean operands from TSTS or source primitive facts");
    case KindEqualsEqualsToken:
    case KindEqualsEqualsEqualsToken:
    case KindExclamationEqualsToken:
    case KindExclamationEqualsEqualsToken:
      return directDecision(areDirectEqualityOperands(left, right), "equality operators require scalar/source-primitive operands or a provider-selected operator");
    case KindLessThanToken:
    case KindLessThanEqualsToken:
    case KindGreaterThanToken:
    case KindGreaterThanEqualsToken:
      return directDecision(areDirectNumericOperands(leftNode, rightNode, left, right), "relational operators require numeric operands from TSTS/source primitive facts or a provider-selected operator");
    case KindPlusToken:
    case KindPlusEqualsToken:
      return directDecision(
        areDirectNumericOperands(leftNode, rightNode, left, right) || areDirectStringConcatOperands(left, right),
        "plus operators require numeric operands, plain string concatenation operands, or a provider-selected operator",
      );
    case KindMinusToken:
    case KindAsteriskToken:
    case KindSlashToken:
    case KindPercentToken:
    case KindMinusEqualsToken:
    case KindAsteriskEqualsToken:
    case KindSlashEqualsToken:
    case KindPercentEqualsToken:
      return directDecision(areDirectNumericOperands(leftNode, rightNode, left, right), "arithmetic operators require numeric operands from TSTS/source primitive facts or a provider-selected operator");
    case KindAmpersandToken:
    case KindBarToken:
    case KindCaretToken:
    case KindLessThanLessThanToken:
    case KindGreaterThanGreaterThanToken:
    case KindGreaterThanGreaterThanGreaterThanToken:
    case KindAmpersandEqualsToken:
    case KindBarEqualsToken:
    case KindCaretEqualsToken:
    case KindLessThanLessThanEqualsToken:
    case KindGreaterThanGreaterThanEqualsToken:
    case KindGreaterThanGreaterThanGreaterThanEqualsToken:
      return directDecision(areDirectIntegralOperands(leftNode, rightNode, left, right), "bitwise and shift operators require integral source primitive operands or integer literal operands");
    case KindQuestionQuestionToken:
      return directDecision(left.sourceOwned && right.sourceOwned, "nullish coalescing requires source-owned operands or a provider-selected operation");
    case KindInstanceOfKeyword:
      return directDecision(true, "instanceof is rendered as a syntax-level type test");
    default:
      return directDecision(false, "operator kind is outside the direct C# operator surface");
  }
}

function isDirectCsharpPrefixUnaryOperatorAllowed(
  operatorKind: number,
  operandNode: Node | undefined,
  operand: OperationSemanticOwnership,
): DirectOperatorDecision {
  switch (operatorKind) {
    case KindExclamationToken:
      return directDecision(isBooleanOperand(operand), "logical not requires a boolean operand from TSTS or source primitive facts");
    case KindTildeToken:
      return directDecision(isIntegralOperand(operandNode, operand), "bitwise not requires an integral source primitive operand or an integer literal operand");
    case KindPlusToken:
    case KindMinusToken:
      return directDecision(isNumericOperand(operandNode, operand), "unary plus/minus requires a numeric operand from TSTS/source primitive facts");
    default:
      return directDecision(false, "prefix operator kind is outside the direct C# operator surface");
  }
}

function isDirectCsharpPostfixUnaryOperatorAllowed(
  operatorKind: number,
  operandNode: Node | undefined,
  operand: OperationSemanticOwnership,
): DirectOperatorDecision {
  switch (operatorKind) {
    case KindPlusPlusToken:
    case KindMinusMinusToken:
      return directDecision(!isNumericLiteralNode(operandNode) && isNumericOperand(operandNode, operand), "postfix increment/decrement requires mutable numeric source operands");
    default:
      return directDecision(false, "postfix operator kind is outside the direct C# operator surface");
  }
}

function directDecision(allowed: boolean, reason: string): DirectOperatorDecision {
  return { allowed, reason };
}

function withDirectOperatorReason(ownership: OperationSemanticOwnership, reason: string): OperationSemanticOwnership {
  return {
    ...ownership,
    reasons: ownership.reasons.includes(reason) ? ownership.reasons : [...ownership.reasons, reason],
  };
}

function areDirectEqualityOperands(left: OperationSemanticOwnership, right: OperationSemanticOwnership): boolean {
  return (isBooleanOperand(left) && isBooleanOperand(right)) ||
    (isNumericOperand(undefined, left) && isNumericOperand(undefined, right)) ||
    (isPlainStringOperand(left) && isPlainStringOperand(right)) ||
    (isCharSourcePrimitive(left) && isCharSourcePrimitive(right)) ||
    (isSourceOwnedNumericOperand(left) && isSourceOwnedNumericOperand(right));
}

function areDirectStringConcatOperands(left: OperationSemanticOwnership, right: OperationSemanticOwnership): boolean {
  return (isPlainStringOperand(left) || isPlainStringOperand(right)) &&
    (isPlainStringOperand(left) || isPlainNumberOperand(left) || isPlainBooleanOperand(left)) &&
    (isPlainStringOperand(right) || isPlainNumberOperand(right) || isPlainBooleanOperand(right));
}

function areDirectNumericOperands(
  leftNode: Node | undefined,
  rightNode: Node | undefined,
  left: OperationSemanticOwnership,
  right: OperationSemanticOwnership,
): boolean {
  if (isPlainNumberOperand(left) && isPlainNumberOperand(right)) {
    return true;
  }
  if ((isPlainNumberOperand(left) && isNumericSourcePrimitive(right)) || (isPlainNumberOperand(right) && isNumericSourcePrimitive(left))) {
    return true;
  }
  if (isPlainBigIntOperand(left) && isPlainBigIntOperand(right)) {
    return true;
  }
  if (isNumericSourcePrimitive(left) && isNumericSourcePrimitive(right)) {
    return left.sourcePrimitive?.kind === right.sourcePrimitive?.kind;
  }
  if (isNumericSourcePrimitive(left) && isNumericLiteralCompatibleWithSourcePrimitive(rightNode, left.sourcePrimitive)) {
    return true;
  }
  if (isNumericSourcePrimitive(right) && isNumericLiteralCompatibleWithSourcePrimitive(leftNode, right.sourcePrimitive)) {
    return true;
  }
  return false;
}

function areDirectIntegralOperands(
  leftNode: Node | undefined,
  rightNode: Node | undefined,
  left: OperationSemanticOwnership,
  right: OperationSemanticOwnership,
): boolean {
  if (isIntegralSourcePrimitive(left) && isIntegralSourcePrimitive(right)) {
    return true;
  }
  if (isSourceOwnedNumericOperand(left) && isSourceOwnedNumericOperand(right)) {
    return true;
  }
  if (isIntegralSourcePrimitive(left) && isIntegerNumericLiteralNode(rightNode)) {
    return true;
  }
  if (isIntegralSourcePrimitive(right) && isIntegerNumericLiteralNode(leftNode)) {
    return true;
  }
  if (isSourceOwnedNumericOperand(left) && isIntegerNumericLiteralNode(rightNode)) {
    return true;
  }
  if (isSourceOwnedNumericOperand(right) && isIntegerNumericLiteralNode(leftNode)) {
    return true;
  }
  return false;
}

function isBooleanOperand(operand: OperationSemanticOwnership): boolean {
  return isBoolSourcePrimitive(operand) || isPlainBooleanOperand(operand);
}

function isNumericOperand(node: Node | undefined, operand: OperationSemanticOwnership): boolean {
  return isPlainNumberOperand(operand) ||
    isPlainBigIntOperand(operand) ||
    isNumericSourcePrimitive(operand) ||
    isNumericLiteralNode(node);
}

function isIntegralOperand(node: Node | undefined, operand: OperationSemanticOwnership): boolean {
  return isIntegralSourcePrimitive(operand) || isIntegerNumericLiteralNode(node);
}

function isPlainStringOperand(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive === undefined && operand.typeFlags.stringLike;
}

function isPlainNumberOperand(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive === undefined && operand.typeFlags.numberLike;
}

function isPlainBigIntOperand(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive === undefined && operand.typeFlags.bigintLike;
}

function isPlainBooleanOperand(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive === undefined && operand.typeFlags.booleanLike;
}

function isSourceOwnedNumericOperand(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive === undefined && operand.sourceOwned && operand.typeFlags.enumLike;
}

function isBoolSourcePrimitive(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive?.kind === "bool";
}

function isCharSourcePrimitive(operand: OperationSemanticOwnership): boolean {
  return operand.sourcePrimitive?.kind === "char16" || operand.sourcePrimitive?.kind === "char32";
}

function isNumericSourcePrimitive(operand: OperationSemanticOwnership): boolean {
  const primitive = operand.sourcePrimitive;
  return primitive !== undefined &&
    primitive.runtimeBase !== "boolean" &&
    primitive.runtimeBase !== "string" &&
    primitive.runtimeBase !== "object";
}

function isIntegralSourcePrimitive(operand: OperationSemanticOwnership): boolean {
  const kind = operand.sourcePrimitive?.kind;
  return kind === "int8" ||
    kind === "uint8" ||
    kind === "int16" ||
    kind === "uint16" ||
    kind === "int32" ||
    kind === "uint32" ||
    kind === "int64" ||
    kind === "uint64" ||
    kind === "int128" ||
    kind === "uint128" ||
    kind === "native-int" ||
    kind === "native-uint";
}

function isNumericLiteralCompatibleWithSourcePrimitive(node: Node | undefined, primitive: OperationSemanticOwnership["sourcePrimitive"]): boolean {
  if (primitive === undefined || !isNumericLiteralNode(node)) {
    return false;
  }
  return isIntegralPrimitiveKind(primitive.kind) ? isIntegerNumericLiteralNode(node) : true;
}

function isIntegralPrimitiveKind(kind: NonNullable<OperationSemanticOwnership["sourcePrimitive"]>["kind"]): boolean {
  return kind === "int8" ||
    kind === "uint8" ||
    kind === "int16" ||
    kind === "uint16" ||
    kind === "int32" ||
    kind === "uint32" ||
    kind === "int64" ||
    kind === "uint64" ||
    kind === "int128" ||
    kind === "uint128" ||
    kind === "native-int" ||
    kind === "native-uint";
}

function isNumericLiteralNode(node: Node | undefined): boolean {
  return node?.Kind === KindNumericLiteral;
}

function isIntegerNumericLiteralNode(node: Node | undefined): boolean {
  if (node?.Kind !== KindNumericLiteral) {
    return false;
  }
  const value = Number(AsNumericLiteral(node)!.Text.replace(/_/g, ""));
  return Number.isSafeInteger(value);
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
      case KindInstanceOfKeyword:
        return "is";
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
  return { kind: "invalid", reason: "source fact expression type" };
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
