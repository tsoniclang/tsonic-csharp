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
  KindArrowFunction,
  KindAsExpression,
  KindBlock,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindConditionalExpression,
  KindElementAccessExpression,
  KindEqualsToken,
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
  KindPropertyAssignment,
  KindPropertyAccessExpression,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindStringLiteral,
  KindSatisfiesExpression,
  KindSuperKeyword,
  KindTemplateExpression,
  KindThisKeyword,
  KindTrueKeyword,
  KindTypeAssertionExpression,
  Node_Name,
  Node_Text,
} from "@tsonic/tsts";
import type { ArgumentPassingFact, Node, ObjectShapeFact, SourceFile, TargetMember } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpTypeNode } from "../ast/csharp-ast.js";
import { expressionToCsharpType, getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, diagnoseUnsupportedAsyncSemantics } from "./modifiers.js";
import { csharpTypeFromObjectShapeFact } from "./object-shapes.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import {
  getCallableSemanticOwnership,
  getProviderOperationOwnership,
  getSemanticOwnership,
  isSourceOwnedProjectConstructibleObjectType,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import { planBlockStatements } from "./statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics);
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics);
    case KindPropertyAccessExpression: {
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics);
    }
    case KindElementAccessExpression: {
      const expression = AsElementAccessExpression(node)!;
      if (!ensureElementAccessCanBeRendered(node, expression.Expression, sourceFile, input, diagnostics)) {
        return invalidExpression("missing target element access fact");
      }
      const selectedElementAccess = input.facts.getSelectedTargetElementAccess(node);
      if (selectedElementAccess?.targetOperation === "string-code-unit") {
        const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
        return {
          kind: "call",
          callee: {
            kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
            receiver,
            name: "Substring",
          },
          arguments: [
            { expression: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics) },
            { expression: { kind: "literal", value: 1 } },
          ],
        };
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
      const selectedConstructorType = selectedTargetCall?.member.returnType === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(selectedTargetCall.member.returnType);
      return {
        kind: "new",
        type: selectedConstructorType ?? expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics),
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
        : undefined;
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
        : undefined;
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

function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    if (targetOperation.static === true) {
      const receiverType = targetOperation.declaringType === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(targetOperation.declaringType);
      if (receiverType === undefined) {
        diagnostics.push({
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          source: "tsonic-csharp",
          message: "Selected static target property requires a declaring target type fact before C# emission.",
        });
        return invalidExpression("selected target static property declaring type");
      }
      return {
        kind: "member",
        receiver: {
          kind: "type",
          type: receiverType,
        },
        name: sanitizeIdentifier(targetOperation.targetOperation),
      };
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
      receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      name: sanitizeIdentifier(targetOperation.targetOperation),
    };
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return invalidExpression("selected target property");
  }
  const sourceName = Node_Text(expression.name!);
  const receiver = expression.Expression;
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return invalidExpression("missing target property fact");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
    receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    name: sanitizeIdentifier(sourceName),
  };
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
      callee: planSelectedTargetCallee(expression.Expression, selectedTargetCall.member, sourceFile, input, diagnostics),
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
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (callee?.Kind === KindPropertyAccessExpression) {
    const property = AsPropertyAccessExpression(callee)!;
    if (member.static === true) {
      const receiverType = member.declaringType === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(member.declaringType);
      if (receiverType === undefined) {
        diagnostics.push({
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          source: "tsonic-csharp",
          message: "Selected static target call requires a declaring target type fact before C# emission.",
        });
        return invalidExpression("selected target static call declaring type");
      }
      if (receiverType.kind === "invalid") {
        return invalidExpression("selected target static call receiver");
      }
      return {
        kind: "member",
        receiver: {
          kind: "type",
          type: receiverType,
        },
        name: sanitizeIdentifier(member.targetName),
      };
    }
    return {
      kind: property.QuestionDotToken === undefined ? "member" : "optionalMember",
      receiver: planExpression(property.Expression!, sourceFile, input, diagnostics),
      name: sanitizeIdentifier(member.targetName),
    };
  }
  if (callee?.Kind === KindIdentifier) {
    if (member.static === true) {
      diagnostics.push({
        code: "CSHARP_UNSUPPORTED_AST",
        category: "error",
        source: "tsonic-csharp",
        message: "Selected static target call requires a property-access callee so the provider-owned target type is explicit.",
      });
      return invalidExpression("selected static target call callee");
    }
    return {
      kind: "identifier",
      name: sanitizeIdentifier(member.targetName),
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
  expectedType?: CsharpTypeNode,
): CsharpExpression {
  const expression = AsArrowFunction(node)!;
  diagnoseUnsupportedAsyncSemantics(node, "arrow function", diagnostics);
  diagnoseMissingLambdaTargetContext(node, input, diagnostics, expectedType);
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
  expectedType?: CsharpTypeNode,
): CsharpExpression {
  const expression = AsFunctionExpression(node)!;
  diagnoseUnsupportedAsyncSemantics(node, "function expression", diagnostics);
  diagnoseMissingLambdaTargetContext(node, input, diagnostics, expectedType);
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): void {
  if (expectedType !== undefined && isCsharpDelegateType(expectedType)) {
    return;
  }
  if (input.facts.getContextualTargetTypeFact(node)?.targetType !== undefined) {
    return;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Lambda emission requires a contextual function/delegate type from TSTS or provider facts before C# emission."));
}

function isCsharpDelegateType(type: CsharpTypeNode): boolean {
  return type.kind === "named" && (type.name === "Func" || type.name === "Action");
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
  expectedTypeSubject?: Node,
): CsharpExpression {
  const expectedTypeLiteral = planExpectedTypeLiteral(node, expectedType, diagnostics);
  if (expectedTypeLiteral !== undefined) {
    return expectedTypeLiteral;
  }
  if (node.Kind === KindAsExpression) {
    return planExpressionWithExpectedType(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (node.Kind === KindSatisfiesExpression) {
    return planExpressionWithExpectedType(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (node.Kind === KindNonNullExpression) {
    return planExpressionWithExpectedType(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (node.Kind === KindTypeAssertionExpression) {
    return planExpressionWithExpectedType(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (node.Kind === KindParenthesizedExpression) {
    const expression = AsParenthesizedExpression(node)!;
    return {
      kind: "parenthesized",
      expression: planExpressionWithExpectedType(expression.Expression!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  if (node.Kind === KindArrowFunction) {
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindFunctionExpression) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (node.Kind === KindObjectLiteralExpression) {
    return planObjectLiteralExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
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
      whenTrue: planExpressionWithExpectedType(expression.WhenTrue!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
      whenFalse: planExpressionWithExpectedType(expression.WhenFalse!, sourceFile, input, diagnostics, expectedType, expectedTypeSubject),
    };
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

function planObjectLiteralExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
): CsharpExpression {
  const objectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, objectShape);
  }
  if (!isSourceOwnedObjectInitializerType(expectedType, expectedTypeSubject, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires a source-owned expected type or finalized TSTS/provider object-shape facts before C# emission."));
    return invalidExpression("object literal without finalized object-shape facts");
  }
  const literal = AsObjectLiteralExpression(node)!;
  const assignments = (literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .map((property) => planObjectLiteralAssignment(property, sourceFile, input, diagnostics))
    .filter((assignment): assignment is { readonly name: string; readonly expression: CsharpExpression } => assignment !== undefined);
  return {
    kind: "objectInitializer",
    type: expectedType,
    assignments,
  };
}

function getExpectedObjectShapeFact(
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ObjectShapeFact | undefined {
  if (expectedTypeSubject === undefined) {
    return undefined;
  }
  const direct = input.facts.getObjectShapeFact(expectedTypeSubject);
  if (direct !== undefined) {
    return direct;
  }
  const type = input.checker.getTypeFromTypeNode(expectedTypeSubject, { sourceFile })
    ?? input.checker.getTypeAtLocation(expectedTypeSubject, { sourceFile });
  return type === undefined
    ? undefined
    : input.facts.getObjectShapeFact(type) ?? input.facts.getObjectShapeFact(type.symbol);
}

function planObjectLiteralExpressionWithObjectShape(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  objectShape: ObjectShapeFact,
): CsharpExpression {
  const type = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
  if (type === undefined) {
    return invalidExpression("object literal with unrenderable object-shape carrier");
  }
  const literal = AsObjectLiteralExpression(node)!;
  const assignments = (literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .map((property) => planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics))
    .filter((assignment): assignment is { readonly name: string; readonly expression: CsharpExpression } => assignment !== undefined);
  return {
    kind: "objectInitializer",
    type,
    assignments,
  };
}

function planObjectShapeLiteralAssignment(
  property: Node,
  objectShape: ObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly name: string; readonly expression: CsharpExpression } | undefined {
  switch (property.Kind) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const sourceName = getObjectLiteralPropertySourceName(property, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        return undefined;
      }
      if (member === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property must match a finalized provider object-shape member."));
        return undefined;
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return undefined;
      }
      return {
        name: member.targetName,
        expression: planExpressionWithExpectedType(propertyAssignment.Initializer, sourceFile, input, diagnostics, memberType),
      };
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return undefined;
      }
      const sourceName = getObjectLiteralPropertySourceName(property, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      const nameNode = Node_Name(property);
      if (member === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand must match a finalized provider object-shape member."));
        return undefined;
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return undefined;
      }
      return {
        name: member.targetName,
        expression: planExpressionWithExpectedType(nameNode, sourceFile, input, diagnostics, memberType),
      };
    }
    case KindSpreadAssignment:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal spread requires finalized provider object-spread semantics before C# emission."));
      return undefined;
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return undefined;
  }
}

function findObjectShapeMember(objectShape: ObjectShapeFact, sourceName: string): ObjectShapeFact["members"][number] | undefined {
  return objectShape.members.find((member) => member.sourceName === sourceName);
}

function isSourceOwnedObjectInitializerType(
  type: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (type.kind !== "named") {
    return false;
  }
  if (expectedTypeSubject === undefined) {
    return false;
  }
  const semanticType = input.checker.getTypeFromTypeNode(expectedTypeSubject, { sourceFile })
    ?? input.checker.getTypeAtLocation(expectedTypeSubject, { sourceFile });
  return isSourceOwnedProjectConstructibleObjectType(semanticType, input);
}

function planObjectLiteralAssignment(
  property: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly name: string; readonly expression: CsharpExpression } | undefined {
  switch (property.Kind) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const name = getSourceOwnedObjectInitializerMemberName(property, diagnostics);
      if (name === undefined || propertyAssignment.Initializer === undefined) {
        if (propertyAssignment.Initializer === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        }
        return undefined;
      }
      return {
        name,
        expression: planExpression(propertyAssignment.Initializer, sourceFile, input, diagnostics),
      };
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return undefined;
      }
      const nameNode = Node_Name(property);
      const name = getSourceOwnedObjectInitializerMemberName(property, diagnostics);
      if (name === undefined || nameNode === undefined) {
        return undefined;
      }
      return {
        name,
        expression: planExpression(nameNode, sourceFile, input, diagnostics),
      };
    }
    case KindSpreadAssignment:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal spread requires finalized provider object-spread semantics before C# emission."));
      return undefined;
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return undefined;
  }
}

function getSourceOwnedObjectInitializerMemberName(
  property: Node,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = Node_Name(property);
  if (nameNode === undefined || nameNode.Kind !== KindIdentifier) {
    diagnostics.push(unsupportedNodeDiagnostic(nameNode ?? property, "Source-owned object initializers support identifier property names; other names require finalized provider object-shape facts."));
    return undefined;
  }
  return sanitizeIdentifier(Node_Text(nameNode));
}

function getObjectLiteralPropertySourceName(
  property: Node,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = Node_Name(property);
  if (nameNode === undefined || (nameNode.Kind !== KindIdentifier && nameNode.Kind !== KindStringLiteral)) {
    diagnostics.push(unsupportedNodeDiagnostic(nameNode ?? property, "Object-shape object initializers require identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(nameNode);
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

function planArrayLiteralExpressionFromFacts(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier?.kind === "array") {
    const elementType = csharpTypeFromTargetTypeRef(carrier.element);
    if (elementType !== undefined) {
      return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType);
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires a renderable provider element carrier type before C# emission."));
    return invalidExpression("array literal with unrenderable element carrier");
  }
  if (carrier?.kind === "tuple") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics);
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Array literal emission requires finalized TSTS/provider array or tuple runtime-carrier facts before C# emission."));
  return invalidExpression("array literal without runtime carrier");
}

function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target operator");
  }
  const expression = AsBinaryExpression(node)!;
  const operator = selectedOperator?.targetOperation ?? getSimpleAssignmentOperator(expression);
  if (operator === undefined) {
    const leftOwnership = getProviderOperationOwnership(expression.Left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(expression.Right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
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
  };
}

function getSimpleAssignmentOperator(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): string | undefined {
  return expression.OperatorToken?.Kind === KindEqualsToken ? "=" : undefined;
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
