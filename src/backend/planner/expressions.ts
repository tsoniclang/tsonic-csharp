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
  AsMethodDeclaration,
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
  AsRegularExpressionLiteral,
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  AsSpreadElement,
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
  KindExportAssignment,
  KindFalseKeyword,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindIdentifier,
  KindMethodDeclaration,
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
  KindRegularExpressionLiteral,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindSpreadElement,
  KindStringLiteral,
  KindSatisfiesExpression,
  KindSuperKeyword,
  KindTemplateExpression,
  KindThisKeyword,
  KindTrueKeyword,
  KindTypeOfExpression,
  KindTypeAssertionExpression,
  KindVariableDeclaration,
  Node_Expression,
  Node_Name,
  Node_Text,
  SourceFile_FileName,
  HasSyntacticModifier,
  HasSourceKind,
  ModifierFlagsAsync,
  SourceKind,
  SourceTokenKind,
} from "./source-ast.js";
import type { ArgumentPassingFact, Node, SourceFile, TargetMember, TargetOperationFact, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../roslyn/syntax.js";
import { runtimeArrayHelperCall } from "./array-helpers.js";
import { expressionToCsharpType, getCsharpTypeForNode, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import {
  getCallableSemanticOwnership,
  getProviderOperationOwnership,
  getSemanticOwnership,
  isSourceOwnedProjectConstructibleObjectSubject,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import { planBlockStatements } from "./statements.js";
import { sourceFileClassName } from "./source-paths.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";

type TargetConversion = NonNullable<ReturnType<TargetCompileInput["facts"]["getTargetConversionFact"]>>;

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
          kind: "InvocationExpression",
          callee: {
            kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
            receiver,
            name: "Substring",
          },
          arguments: [
            { kind: "Argument", expression: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics) },
            { kind: "Argument", expression: { kind: "LiteralExpression", value: 1 } },
          ],
        };
      }
      return {
        kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
        receiver: selectedElementAccess === undefined
          ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
          : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics),
        argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics);
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
      const member = selectedTargetCall === undefined
        ? undefined
        : instantiateSelectedTargetMember(node, expression.Expression, selectedTargetCall.member, sourceFile, input);
      const selectedConstructorType = selectedTargetCall?.member.returnType === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(member?.returnType ?? selectedTargetCall.member.returnType);
      return {
        kind: "ObjectCreationExpression",
        type: selectedConstructorType ?? getCsharpTypeForNode(node, sourceFile, input, undefined, diagnostics),
        arguments: member === undefined
          ? (expression.Arguments?.Nodes ?? [])
            .filter((argument): argument is Node => argument !== undefined)
            .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics))
          : planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics),
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
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics);
      if (binary !== undefined) {
        return binary;
      }
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return invalidExpression("unsupported expression");
    }
  }
}

function applyTargetConversionFact(
  node: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expression: CsharpExpression,
): CsharpExpression {
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion === undefined || conversion.operation === undefined) {
    return expression;
  }
  return planTargetConversionOperation(node, conversion, expression, diagnostics);
}

function planTargetConversionOperation(
  node: Node,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const operation = conversion.operation;
  if (operation === undefined) {
    return expression;
  }
  switch (operation.operationKind) {
    case "method":
      return planTargetConversionMethodCall(node, operation, expression, diagnostics);
    case "constructor":
      return planTargetConversionConstructor(node, conversion, expression, diagnostics);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `Target conversion operation '${operation.operationKind}' is not renderable by the C# backend.`));
      return invalidExpression("unsupported target conversion operation");
  }
}

function planTargetConversionMethodCall(
  node: Node,
  operation: TargetOperationFact,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const callee = targetConversionStaticMethodCallee(operation, diagnostics, node);
  if (callee === undefined) {
    return invalidExpression("target conversion method");
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: [{ kind: "Argument", expression }],
  };
}

function targetConversionStaticMethodCallee(
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  const qualified = splitQualifiedTargetOperation(operation.targetOperation);
  const declaringTypeRef = qualified === undefined ? undefined : { kind: "target-named" as const, id: qualified.declaringTypeId };
  const methodName = qualified?.memberName ?? operation.targetOperation;
  const declaringType = declaringTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(declaringTypeRef);
  if (declaringType === undefined || methodName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion method requires a declaring target type and method name before C# emission."));
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: methodName,
  };
}

function splitQualifiedTargetOperation(targetOperation: string): { readonly declaringTypeId: string; readonly memberName: string } | undefined {
  const separator = targetOperation.lastIndexOf(".");
  if (separator <= 0 || separator === targetOperation.length - 1) {
    return undefined;
  }
  return {
    declaringTypeId: targetOperation.slice(0, separator),
    memberName: targetOperation.slice(separator + 1),
  };
}

function planTargetConversionConstructor(
  node: Node,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const targetTypeRef = conversion.convertedType;
  const targetType = targetTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(targetTypeRef);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion constructor requires a renderable target type before C# emission."));
    return invalidExpression("target conversion constructor");
  }
  return {
    kind: "ObjectCreationExpression",
    type: targetType,
    arguments: [{ kind: "Argument", expression }],
  };
}

function invalidExpression(reason: string): CsharpExpression {
  return { kind: "InvalidExpression", reason };
}

function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const sourceName = Node_Text(AsIdentifier(identifier));
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(identifier, { sourceFile });
  if (isExternalDeclarationReference(sourceReference, sourceFile)) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("declaration identifier expression");
  }
  const directTargetBinding = input.facts.getTargetBindingFact(input.semantics.getSymbolAtLocation(identifier, { sourceFile })) ??
    input.facts.getTargetBindingFact(input.semantics.getResolvedSymbol(identifier, { sourceFile }));
  if (directTargetBinding !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(identifier, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  return { kind: "IdentifierName", name: sanitizeIdentifier(sourceName) };
}

function planSelectedTargetReceiverExpression(
  receiver: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (!HasSourceKind(input.ast, receiver, KindIdentifier)) {
    return planExpression(receiver, sourceFile, input, diagnostics);
  }
  const sourceName = Node_Text(AsIdentifier(receiver));
  if (isExternalDeclarationReference(input.semantics.getProjectSourceReferenceForNode(receiver, { sourceFile }), sourceFile)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver, `Selected instance target member '${sourceName}' requires a value receiver; provider declaration identifiers cannot be emitted as instance receivers.`));
    return invalidExpression("provider declaration receiver");
  }
  return { kind: "IdentifierName", name: sanitizeIdentifier(sourceName) };
}

function isExternalDeclarationReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  sourceFile: SourceFile,
): boolean {
  return reference !== undefined &&
    reference.sourceFile !== sourceFile &&
    (reference.sourceFile.IsDeclarationFile || SourceFile_FileName(reference.sourceFile).startsWith("tsts-provider://"));
}

function isModuleStaticValueDeclaration(declaration: Node, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.ast, declaration, KindVariableDeclaration) ||
    HasSourceKind(input.ast, declaration, KindExportAssignment);
}

function planProjectSourceModuleMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(node, { sourceFile });
  if (sourceReference === undefined || sourceReference.sourceFile === sourceFile) {
    return undefined;
  }
  if (!isModuleStaticValueDeclaration(sourceReference.declaration, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Cross-file source reference requires a top-level function or variable declaration resolved by TSTS."));
    return invalidExpression("cross-file source reference");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(input, SourceFile_FileName(sourceReference.sourceFile)),
    },
    name: sanitizeIdentifier(sourceReference.symbol.Name),
  };
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
    const staticMember = targetStaticMemberExpression(targetOperation, diagnostics, propertyAccess);
    if (staticMember !== undefined) {
      return staticMember;
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics),
      name: targetOperation.targetOperation,
    };
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return invalidExpression("selected target property");
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const sourceName = Node_Text(expression.name!);
  const receiver = expression.Expression;
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return invalidExpression("missing target property fact");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    name: sanitizeIdentifier(sourceName),
  };
}

function targetStaticMemberExpression(
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  const qualified = splitQualifiedTargetOperation(operation.targetOperation);
  if (qualified === undefined) {
    return undefined;
  }
  const declaringType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: qualified.declaringTypeId });
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Static target property requires a renderable declaring target type before C# emission."));
    return invalidExpression("static target property");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: qualified.memberName,
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
    const member = instantiateSelectedTargetMember(node, expression.Expression, selectedTargetCall.member, sourceFile, input);
    return {
      kind: "InvocationExpression",
      callee: planSelectedTargetCallee(expression.Expression, member, sourceFile, input, diagnostics),
      arguments: planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics),
    };
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return invalidExpression("missing target call fact");
  }
  return {
    kind: "InvocationExpression",
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
  if (HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    const property = AsPropertyAccessExpression(callee)!;
    if (member.static === true) {
      const declaringType = member.declaringType === undefined ? undefined : csharpTypeFromTargetTypeRef(member.declaringType);
      if (declaringType === undefined) {
        diagnostics.push({
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          source: "tsonic-csharp",
          message: "Selected static target call requires a provider-owned declaring target type fact before C# emission.",
        });
        return invalidExpression("selected target static call declaring type");
      }
      return {
        kind: "SimpleMemberAccessExpression",
        receiver: declaringType,
        name: member.targetName,
      };
    }
    return {
      kind: property.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(property.Expression!, sourceFile, input, diagnostics),
      name: member.targetName,
    };
  }
  if (HasSourceKind(input.ast, callee, KindIdentifier)) {
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
      kind: "IdentifierName",
      name: member.targetName,
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

function instantiateSelectedTargetMember(
  operationNode: Node,
  callee: Node | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetMember {
  const propertyAccess = HasSourceKind(input.ast, callee, KindPropertyAccessExpression)
    ? AsPropertyAccessExpression(callee)
    : undefined;
  const typeSubject = propertyAccess?.Expression ?? operationNode;
  const bindingSubject = propertyAccess?.Expression ?? callee ?? operationNode;
  const carrier = input.semantics.getRuntimeCarrierForNode(typeSubject, { sourceFile });
  if (carrier?.kind !== "target-named" || (carrier.typeArguments ?? []).length === 0) {
    return member;
  }
  const binding = input.semantics.getTargetBindingForReference(bindingSubject, { sourceFile });
  const typeParameters = binding?.typeParameters ?? [];
  if (typeParameters.length === 0) {
    return member;
  }
  const typeArgumentMap = new Map<string, TargetTypeRef>();
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = carrier.typeArguments?.[index];
    if (parameter !== undefined && argument !== undefined) {
      typeArgumentMap.set(parameter.name, argument);
    }
  }
  if (typeArgumentMap.size === 0) {
    return member;
  }
  return substituteTargetMemberTypeParameters(member, typeArgumentMap);
}

function substituteTargetMemberTypeParameters(
  member: TargetMember,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
  return {
    ...member,
    ...(member.declaringType !== undefined ? { declaringType: substituteTargetTypeRef(member.declaringType, typeArgumentMap) } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeArgumentMap),
    })),
    ...(member.returnType !== undefined ? { returnType: substituteTargetTypeRef(member.returnType, typeArgumentMap) } : {}),
  };
}

function substituteTargetTypeRef(type: TargetTypeRef, typeArgumentMap: ReadonlyMap<string, TargetTypeRef>): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return typeArgumentMap.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)) }
          : {}),
      };
    case "array":
      return { ...type, element: substituteTargetTypeRef(type.element, typeArgumentMap) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeRef(element, typeArgumentMap)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeRef(type.pointee, typeArgumentMap) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)),
        result: substituteTargetTypeRef(type.result, typeArgumentMap),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeRef(type.owner, typeArgumentMap) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function planSelectedTargetCallArguments(
  callee: Node | undefined,
  expression: { readonly Arguments?: { readonly Nodes?: readonly (Node | undefined)[] } } | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpArgument[] {
  const receiverArgument = planSelectedTargetReceiverArgument(callee, member, sourceFile, input, diagnostics);
  const parameterOffset = receiverArgument === undefined ? 0 : 1;
  const argumentsList = (expression?.Arguments?.Nodes ?? [])
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument, index) => {
      const parameter = member.parameters[index + parameterOffset];
      const expectedType = parameter === undefined ? undefined : csharpTypeFromTargetTypeRef(parameter.type);
      return planCallArgument(argument, sourceFile, input, diagnostics, expectedType);
    });
  return receiverArgument === undefined ? argumentsList : [receiverArgument, ...argumentsList];
}

function planSelectedTargetReceiverArgument(
  callee: Node | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpArgument | undefined {
  if (member.receiverPassing !== "first-argument") {
    return undefined;
  }
  if (!HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target helper call requires a property-access receiver for first-argument receiver passing.",
    });
    return undefined;
  }
  const receiver = AsPropertyAccessExpression(callee)?.Expression;
  if (receiver === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target helper call requires a receiver expression.",
    });
    return undefined;
  }
  const parameter = member.parameters[0];
  const expectedType = parameter === undefined ? undefined : csharpTypeFromTargetTypeRef(parameter.type);
  return planCallArgument(receiver, sourceFile, input, diagnostics, expectedType);
}

function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): CsharpExpression {
  const expression = AsArrowFunction(node)!;
  diagnoseMissingLambdaTargetContext(node, input, diagnostics, expectedType);
  if (HasSourceKind(input.ast, expression.Body, KindBlock)) {
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(node) ? { async: true } : {}),
      parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
      body: {
        kind: "Block",
        statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics),
      },
    };
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
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
  diagnoseMissingLambdaTargetContext(node, input, diagnostics, expectedType);
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      kind: "Block",
      statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics),
    },
  };
}

function isAsyncExpression(node: Node): boolean {
  return HasSyntacticModifier(node, ModifierFlagsAsync);
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
      if (!HasSourceKind(input.ast, parameter.name, KindIdentifier)) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode, "Lambda parameter binding is outside the current C# planning surface."));
      }
      return {
        kind: "Parameter",
        name: HasSourceKind(input.ast, parameter.name, KindIdentifier) ? sanitizeIdentifier(Node_Text(parameter.name)) : "arg",
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
  return type.kind === "IdentifierName" && (type.name === "Func" || type.name === "Action" || type.name === "Predicate");
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
  if (conversion?.convertedType !== undefined) {
    const expectedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (expectedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return invalidExpression("target argument conversion type");
    }
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType);
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType);
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
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    return planObjectLiteralExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "TupleType") {
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics);
  }
  if (HasSourceKind(input.ast, node, KindArrayLiteralExpression) && expectedType.kind === "ArrayType") {
    return planArrayLiteralExpression(node, sourceFile, input, diagnostics, expectedType.elementType);
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
  const assignments = mergeObjectInitializerAssignments((literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .flatMap((property) => planObjectLiteralAssignment(property, sourceFile, input, diagnostics)));
  return {
    kind: "ObjectCreationExpression",
    type: expectedType,
    assignments,
  };
}

function getExpectedObjectShapeFact(
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(expectedTypeSubject, sourceFile, input);
}

function planObjectLiteralExpressionWithObjectShape(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  objectShape: CsharpObjectShapeFact,
): CsharpExpression {
  const type = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
  if (type === undefined) {
    return invalidExpression("object literal with unrenderable object-shape carrier");
  }
  const literal = AsObjectLiteralExpression(node)!;
  const assignments = mergeObjectInitializerAssignments((literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .flatMap((property) => planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics)));
  return {
    kind: "ObjectCreationExpression",
    type,
    assignments,
  };
}

function planObjectShapeLiteralAssignment(
  property: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpObjectInitializerAssignment[] {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        return [];
      }
      if (member === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property must match a finalized provider object-shape member."));
        return [];
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression: planExpressionWithExpectedType(propertyAssignment.Initializer, sourceFile, input, diagnostics, memberType),
      }];
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return [];
      }
      const sourceName = getObjectLiteralPropertySourceName(property, input, diagnostics);
      const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
      const nameNode = Node_Name(property);
      if (member === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand must match a finalized provider object-shape member."));
        return [];
      }
      const memberType = csharpTypeFromTargetTypeRef(member.type);
      if (memberType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name: objectShapeStorageMemberName(objectShape, member),
        expression: planExpressionWithExpectedType(nameNode, sourceFile, input, diagnostics, memberType),
      }];
    }
    case KindMethodDeclaration: {
      const assignment = planObjectShapeMethodMemberAssignment(property, objectShape, sourceFile, input, diagnostics);
      return assignment === undefined ? [] : [assignment];
    }
    case KindSpreadAssignment:
      return planObjectShapeSpreadAssignments(property, objectShape, sourceFile, input, diagnostics);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return [];
  }
}

function planObjectShapeSpreadAssignments(
  spreadNode: Node,
  targetShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpObjectInitializerAssignment[] {
  const spread = AsSpreadAssignment(spreadNode);
  const expression = spread?.Expression;
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a source expression."));
    return [];
  }
  if (!HasSourceKind(input.ast, expression, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a single-evaluation provider lowering for non-identifier spread expressions before C# emission."));
    return [];
  }
  const sourceShape = getExpectedObjectShapeFact(expression, sourceFile, input);
  if (sourceShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires finalized provider object-shape facts for the spread expression before C# emission."));
    return [];
  }
  const assignments: CsharpObjectInitializerAssignment[] = [];
  for (const targetMember of targetShape.members) {
    const sourceMember = sourceShape.members.find((member) => member.sourceName === targetMember.sourceName);
    if (sourceMember === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread source shape does not provide required member '${targetMember.sourceName}'.`));
      return [];
    }
    if (!objectShapeMemberTypesMatch(sourceMember, targetMember)) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread member '${targetMember.sourceName}' requires matching finalized source and target member carriers.`));
      return [];
    }
    assignments.push({
      kind: "AssignmentExpression",
      name: objectShapeStorageMemberName(targetShape, targetMember),
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: planExpression(expression, sourceFile, input, diagnostics),
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      },
    });
  }
  return assignments;
}

function planObjectShapeMethodMemberAssignment(
  methodNode: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, input, diagnostics);
  const member = sourceName === undefined ? undefined : findObjectShapeMember(objectShape, sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method must match a finalized provider object-shape member."));
    return undefined;
  }
  const memberType = csharpTypeFromTargetTypeRef(member.type);
  if (memberType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a renderable delegate target type before C# emission.`));
    return undefined;
  }
  if (!isCsharpDelegateType(memberType)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, `Object-shape method '${member.sourceName}' must carry a finalized delegate target type before C# emission.`));
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    name: objectShapeStorageMemberName(objectShape, member),
    expression: planObjectLiteralMethodAsLambda(methodNode, sourceFile, input, diagnostics, memberType),
  };
}

function planObjectLiteralMethodAsLambda(
  methodNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
): CsharpExpression {
  const method = AsMethodDeclaration(methodNode);
  diagnoseMissingLambdaTargetContext(methodNode, input, diagnostics, expectedType);
  if (method === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method-declaration AST node."));
    return invalidExpression("object literal method without method declaration");
  }
  if ((method.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal generic methods require finalized target delegate facts before C# emission."));
    return invalidExpression("generic object literal method");
  }
  if (method.Body === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Object literal method emission requires a method body."));
    return invalidExpression("object literal method without body");
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(methodNode) ? { async: true } : {}),
    parameters: planLambdaParameters(method.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      kind: "Block",
      statements: planBlockStatements(method.Body, sourceFile, input, diagnostics),
    },
  };
}

function findObjectShapeMember(objectShape: CsharpObjectShapeFact, sourceName: string): CsharpObjectShapeFact["members"][number] | undefined {
  return objectShape.members.find((member) => member.sourceName === sourceName);
}

function isSourceOwnedObjectInitializerType(
  type: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (type.kind !== "IdentifierName") {
    return false;
  }
  if (expectedTypeSubject === undefined) {
    return false;
  }
  return isSourceOwnedProjectConstructibleObjectSubject(expectedTypeSubject, sourceFile, input);
}

function planObjectLiteralAssignment(
  property: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpObjectInitializerAssignment[] {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const name = getSourceOwnedObjectInitializerMemberName(property, input, diagnostics);
      if (name === undefined || propertyAssignment.Initializer === undefined) {
        if (propertyAssignment.Initializer === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        }
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name,
        expression: planExpression(propertyAssignment.Initializer, sourceFile, input, diagnostics),
      }];
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."));
        return [];
      }
      const nameNode = Node_Name(property);
      const name = getSourceOwnedObjectInitializerMemberName(property, input, diagnostics);
      if (name === undefined || nameNode === undefined) {
        return [];
      }
      return [{
        kind: "AssignmentExpression",
        name,
        expression: planExpression(nameNode, sourceFile, input, diagnostics),
      }];
    }
    case KindMethodDeclaration: {
      const assignment = planSourceOwnedMethodMemberAssignment(property, sourceFile, input, diagnostics);
      return assignment === undefined ? [] : [assignment];
    }
    case KindSpreadAssignment:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal spread requires finalized provider object-spread semantics before C# emission."));
      return [];
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal member is outside the current C# planning surface."));
      return [];
  }
}

function mergeObjectInitializerAssignments(assignments: readonly CsharpObjectInitializerAssignment[]): readonly CsharpObjectInitializerAssignment[] {
  const merged = new Map<string, CsharpObjectInitializerAssignment>();
  for (const assignment of assignments) {
    merged.set(assignment.name, assignment);
  }
  return [...merged.values()];
}

function objectShapeMemberTypesMatch(left: CsharpObjectShapeFact["members"][number], right: CsharpObjectShapeFact["members"][number]): boolean {
  return targetTypeRefsMatch(left.type, right.type);
}

function planSourceOwnedMethodMemberAssignment(
  methodNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const name = getSourceOwnedObjectInitializerMemberName(methodNode, input, diagnostics);
  if (name === undefined) {
    return undefined;
  }
  const memberType = getContextualTargetCsharpType(methodNode, input);
  if (memberType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Source-owned object literal method requires a contextual target delegate fact from TSTS before C# emission."));
    return undefined;
  }
  if (!isCsharpDelegateType(memberType)) {
    diagnostics.push(unsupportedNodeDiagnostic(methodNode, "Source-owned object literal method requires a contextual delegate target type before C# emission."));
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    name,
    expression: planObjectLiteralMethodAsLambda(methodNode, sourceFile, input, diagnostics, memberType),
  };
}

function getContextualTargetCsharpType(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const targetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function getSourceOwnedObjectInitializerMemberName(
  property: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = Node_Name(property);
  if (nameNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(property, "Source-owned object initializers require a property name."));
    return undefined;
  }
  if (HasSourceKind(input.ast, nameNode, KindIdentifier)) {
    return sanitizeIdentifier(Node_Text(nameNode));
  }
  if (HasSourceKind(input.ast, nameNode, KindStringLiteral)) {
    const text = AsStringLiteral(nameNode)?.Text;
    if (text !== undefined) {
      const sanitized = sanitizeIdentifier(text);
      if (sanitized === text || sanitized === `@${text}`) {
        return sanitized;
      }
    }
  }
  diagnostics.push(unsupportedNodeDiagnostic(nameNode, "Source-owned object initializers support identifier-compatible property names; other names require finalized provider object-shape facts."));
  return undefined;
}

function getObjectLiteralPropertySourceName(
  property: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = Node_Name(property);
  if (nameNode === undefined || (!HasSourceKind(input.ast, nameNode, KindIdentifier) && !HasSourceKind(input.ast, nameNode, KindStringLiteral))) {
    diagnostics.push(unsupportedNodeDiagnostic(nameNode ?? property, "Object-shape object initializers require identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(nameNode);
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

function planRegularExpressionLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier?.kind !== "target-named" || carrier.id !== "Tsonic.CSharp.Js.RegExp") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a finalized provider runtime carrier for Tsonic.CSharp.Js.RegExp."));
    return invalidExpression("regexp literal without provider carrier");
  }
  const literal = parseRegularExpressionLiteral(Node_Text(AsRegularExpressionLiteral(node)));
  if (literal === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal text could not be split into pattern and flags by the C# backend."));
    return invalidExpression("invalid regexp literal text");
  }
  return {
    kind: "ObjectCreationExpression",
    type: csharpTypeFromTargetTypeRef(carrier) ?? { kind: "InvalidType", reason: "regexp carrier" },
    arguments: [
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.pattern } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.flags } },
    ],
  };
}

function parseRegularExpressionLiteral(text: string): { readonly pattern: string; readonly flags: string } | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return {
        pattern: text.slice(1, index),
        flags: text.slice(index + 1),
      };
    }
  }
  return undefined;
}

function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const literal = AsArrayLiteralExpression(node)!;
  return {
    kind: "TupleExpression",
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
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindSpreadElement))) {
    return planArraySpreadLiteralExpression(node, sourceFile, input, diagnostics, elementType);
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    elements: (literal.Elements?.Nodes ?? [])
      .filter((element): element is Node => element !== undefined)
      .map((element) => planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType)),
  };
}

function planArraySpreadLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
): CsharpExpression {
  const expectedArrayType = { kind: "ArrayType", elementType } satisfies CsharpTypeNode;
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, expectedArrayType);
  if (chunks.length === 0) {
    return {
      kind: "ArrayCreationExpression",
      elementType,
      elements: [],
    };
  }
  if (chunks.length === 1 && chunks[0]?.fromSpread !== true) {
    return chunks[0]!.expression;
  }
  return runtimeArrayHelperCall("Concat", chunks.map((chunk) => ({ kind: "Argument", expression: chunk.expression })));
}

function createArraySpreadChunks(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  expectedArrayType: CsharpTypeNode,
): readonly { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] {
  const literal = AsArrayLiteralExpression(node)!;
  const chunks: { readonly expression: CsharpExpression; readonly fromSpread?: boolean }[] = [];
  let pendingElements: CsharpExpression[] = [];
  const flushPending = () => {
    if (pendingElements.length === 0) {
      return;
    }
    chunks.push({
      expression: {
        kind: "ArrayCreationExpression",
        elementType,
        elements: pendingElements,
      },
    });
    pendingElements = [];
  };
  for (const element of literal.Elements?.Nodes ?? []) {
    if (element === undefined) {
      continue;
    }
    if (!HasSourceKind(input.ast, element, KindSpreadElement)) {
      pendingElements.push(planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType));
      continue;
    }
    flushPending();
    const expression = AsSpreadElement(element)?.Expression;
    if (expression === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a source expression."));
      continue;
    }
    const spreadCarrier = input.semantics.getRuntimeCarrierForNode(expression, { sourceFile });
    const spreadType = spreadCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(spreadCarrier);
    if (spreadType === undefined || !sameCsharpType(spreadType, expectedArrayType)) {
      diagnostics.push(unsupportedNodeDiagnostic(element, "Array spread requires a finalized provider array carrier matching the target array element type before C# emission."));
      continue;
    }
    chunks.push({
      expression: planExpression(expression, sourceFile, input, diagnostics),
      fromSpread: true,
    });
  }
  flushPending();
  return chunks;
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
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics);
  if (typeTest !== undefined) {
    return typeTest;
  }
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
  const operator = selectedOperator?.targetOperation ?? getSourceOwnedBinaryOperator(expression, sourceFile, input);
  if (operator === undefined) {
    const leftOwnership = getProviderOperationOwnership(expression.Left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(expression.Right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
  }
  return {
    kind: "BinaryExpression",
    left: planExpression(expression.Left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(expression.Right!, sourceFile, input, diagnostics),
  };
}

function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator === undefined) {
    const operand = Node_Expression(node);
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# typeof expression emission requires a selected provider typeof operator fact.", ownership);
    return invalidExpression("missing target typeof operator fact");
  }
  if (selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target typeof operator");
  }
  const runtimeKind = getStandaloneTypeofRuntimeKind(selectedOperator.targetOperation);
  if (runtimeKind === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider typeof operator fact, but provider selected '${selectedOperator.targetOperation}'.`));
    return invalidExpression("selected target non-typeof operator");
  }
  return { kind: "LiteralExpression", value: runtimeKind };
}

function getStandaloneTypeofRuntimeKind(targetOperation: string): "string" | "number" | "boolean" | "bigint" | undefined {
  switch (targetOperation) {
    case "typeof:string":
      return "string";
    case "typeof:number":
      return "number";
    case "typeof:boolean":
      return "boolean";
    case "typeof:bigint":
      return "bigint";
    default:
      return undefined;
  }
}

function tryPlanTypeTestExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" || selectedOperator.targetOperation !== "is") {
    return undefined;
  }
  if (expression.Left === undefined || expression.Right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression.Left!, "Provider selected a type-test operation, but the expression is missing an operand."));
    return invalidExpression("selected type-test without operands");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(expression.Left, sourceFile, input, diagnostics),
    type: expressionToCsharpType(expression.Right, sourceFile, input, diagnostics),
  };
}

function tryPlanTypeofComparisonExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  _sourceFile: SourceFile,
  _input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" ||
    (selectedOperator.targetOperation !== "typeof-is" && selectedOperator.targetOperation !== "typeof-is-not")) {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression, _input);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression.Left!, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return invalidExpression("selected typeof comparison without typeof operand");
  }
  diagnostics.push(unsupportedNodeDiagnostic(operand, "Provider selected a typeof comparison operation, but the public TSTS observation API did not provide the target type required for C# emission."));
  return invalidExpression("selected typeof comparison without target type");
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  input: TargetCompileInput,
): Node | undefined {
  if (HasSourceKind(input.ast, expression.Left, KindTypeOfExpression)) {
    return Node_Expression(expression.Left);
  }
  if (HasSourceKind(input.ast, expression.Right, KindTypeOfExpression)) {
    return Node_Expression(expression.Right);
  }
  return undefined;
}

function combineOwnership(left: OperationSemanticOwnership, right: OperationSemanticOwnership): OperationSemanticOwnership {
  const reasons = [...left.reasons, ...right.reasons];
  return {
    requiresTargetFact: left.requiresTargetFact || right.requiresTargetFact,
    sourceOwned: left.sourceOwned && right.sourceOwned,
    reasons,
  };
}

function getSourceOwnedUnaryOperator(
  operatorKind: unknown,
  operand: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (!getProviderOperationOwnership(operand, sourceFile, input).sourceOwned) {
    return undefined;
  }
  switch (SourceTokenKind(input.ast, operatorKind)) {
    case "KindPlusPlusToken":
      return "++";
    case "KindMinusMinusToken":
      return "--";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindExclamationToken":
      return "!";
    default:
      return undefined;
  }
}

function getUnaryOperatorKind(expression: { readonly Operator?: unknown; readonly OperatorToken?: Node | undefined }): unknown {
  return expression.Operator ?? expression.OperatorToken?.Kind;
}

function getSourceOwnedBinaryOperator(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  const ownership = combineOwnership(
    getProviderOperationOwnership(expression.Left, sourceFile, input),
    getProviderOperationOwnership(expression.Right, sourceFile, input),
  );
  if (!ownership.sourceOwned) {
    return undefined;
  }
  switch (SourceTokenKind(input.ast, expression.OperatorToken?.Kind)) {
    case "KindEqualsToken":
      return "=";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
    case "KindSlashToken":
      return "/";
    case "KindPercentToken":
      return "%";
    case "KindLessThanToken":
      return "<";
    case "KindLessThanEqualsToken":
      return "<=";
    case "KindGreaterThanToken":
      return ">";
    case "KindGreaterThanEqualsToken":
      return ">=";
    case "KindEqualsEqualsToken":
    case "KindEqualsEqualsEqualsToken":
      return "==";
    case "KindExclamationEqualsToken":
    case "KindExclamationEqualsEqualsToken":
      return "!=";
    case "KindAmpersandAmpersandToken":
      return "&&";
    case "KindBarBarToken":
      return "||";
    case "KindPlusEqualsToken":
      return "+=";
    case "KindMinusEqualsToken":
      return "-=";
    case "KindAsteriskEqualsToken":
      return "*=";
    case "KindSlashEqualsToken":
      return "/=";
    case "KindPercentEqualsToken":
      return "%=";
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
  return { kind: "InvalidType", reason: "source fact expression type" };
}
