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
  KindEqualsToken,
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
  ModifierFlagsAsync,
} from "@tsonic/tsts";
import type { ArgumentPassingFact, Node, ObjectShapeFact, SourceFile, TargetMember, TargetOperationFact, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../ast/csharp-ast.js";
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
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
      return planIdentifierExpression(node, sourceFile, input, diagnostics);
    case KindStringLiteral:
      return { kind: "literal", value: AsStringLiteral(node)!.Text };
    case KindNoSubstitutionTemplateLiteral:
      return { kind: "literal", value: AsNoSubstitutionTemplateLiteral(node)!.Text };
    case KindNumericLiteral:
      return { kind: "literal", value: Number(AsNumericLiteral(node)!.Text) };
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
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
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return invalidExpression("await without expression");
      }
      return {
        kind: "await",
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
    kind: "call",
    callee,
    arguments: [{ expression }],
  };
}

function targetConversionStaticMethodCallee(
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  if (operation.static === false) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Instance target conversion methods require an explicit provider rendering contract before C# emission."));
    return undefined;
  }
  const qualified = splitQualifiedTargetOperation(operation.targetOperation);
  const declaringTypeRef = operation.declaringType ?? (qualified === undefined ? undefined : { kind: "target-named" as const, id: qualified.declaringTypeId });
  const methodName = qualified?.memberName ?? operation.targetOperation;
  const declaringType = declaringTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(declaringTypeRef);
  if (declaringType === undefined || methodName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion method requires a declaring target type and method name before C# emission."));
    return undefined;
  }
  return {
    kind: "member",
    receiver: {
      kind: "type",
      type: declaringType,
    },
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
  const targetTypeRef = conversion.operation?.targetType ?? conversion.convertedType;
  const targetType = targetTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(targetTypeRef);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion constructor requires a renderable target type before C# emission."));
    return invalidExpression("target conversion constructor");
  }
  return {
    kind: "new",
    type: targetType,
    arguments: [{ expression }],
  };
}

function invalidExpression(reason: string): CsharpExpression {
  return { kind: "invalid", reason };
}

function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const sourceName = AsIdentifier(identifier)!.Text;
  const targetBinding = input.semantics.getTargetBindingForReference(identifier, { sourceFile });
  if (targetBinding !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(identifier, { sourceFile });
  if (isExternalDeclarationReference(sourceReference, sourceFile)) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("declaration identifier expression");
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(identifier, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  return { kind: "identifier", name: sanitizeIdentifier(sourceName) };
}

function planSelectedTargetReceiverExpression(
  receiver: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (receiver.Kind !== KindIdentifier) {
    return planExpression(receiver, sourceFile, input, diagnostics);
  }
  const sourceName = AsIdentifier(receiver)!.Text;
  if (isExternalDeclarationReference(input.semantics.getProjectSourceReferenceForNode(receiver, { sourceFile }), sourceFile)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver, `Selected instance target member '${sourceName}' requires a value receiver; provider declaration identifiers cannot be emitted as instance receivers.`));
    return invalidExpression("provider declaration receiver");
  }
  return { kind: "identifier", name: sanitizeIdentifier(sourceName) };
}

function isExternalDeclarationReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  sourceFile: SourceFile,
): boolean {
  return reference !== undefined &&
    reference.sourceFile !== sourceFile &&
    (reference.sourceFile.IsDeclarationFile || SourceFile_FileName(reference.sourceFile).startsWith("tsts-provider://"));
}

function isModuleStaticValueDeclaration(declaration: Node): boolean {
  return declaration.Kind === KindFunctionDeclaration ||
    declaration.Kind === KindVariableDeclaration ||
    declaration.Kind === KindExportAssignment;
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
  if (!isModuleStaticValueDeclaration(sourceReference.declaration)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Cross-file source reference requires a top-level function or variable declaration resolved by TSTS."));
    return invalidExpression("cross-file source reference");
  }
  return {
    kind: "member",
    receiver: {
      kind: "type",
      type: {
        kind: "named",
        name: sourceFileClassName(input, SourceFile_FileName(sourceReference.sourceFile)),
      },
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
        name: targetOperation.targetOperation,
      };
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "member" : "optionalMember",
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
      arguments: planSelectedTargetCallArguments(expression, selectedTargetCall.member, sourceFile, input, diagnostics),
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
        name: member.targetName,
      };
    }
    return {
      kind: property.QuestionDotToken === undefined ? "member" : "optionalMember",
      receiver: planSelectedTargetReceiverExpression(property.Expression!, sourceFile, input, diagnostics),
      name: member.targetName,
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

function planSelectedTargetCallArguments(
  expression: ReturnType<typeof AsCallExpression>,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpArgument[] {
  const argumentsList = (expression?.Arguments?.Nodes ?? [])
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics));
  const receiverArgumentIndex = member.receiverArgumentIndex;
  if (receiverArgumentIndex === undefined) {
    return argumentsList;
  }
  if (expression?.Expression?.Kind !== KindPropertyAccessExpression) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target call receiver argument requires a property-access source callee before C# emission.",
    });
    return argumentsList;
  }
  if (!Number.isInteger(receiverArgumentIndex) || receiverArgumentIndex < 0 || receiverArgumentIndex > argumentsList.length) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target call receiver argument index is outside the source argument range before C# emission.",
    });
    return argumentsList;
  }
  const receiverParameter = member.parameters[receiverArgumentIndex];
  if (receiverParameter === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target call receiver argument index has no matching target parameter before C# emission.",
    });
    return argumentsList;
  }
  const receiver = AsPropertyAccessExpression(expression.Expression)?.Expression;
  if (receiver === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target call receiver argument requires a concrete receiver expression before C# emission.",
    });
    return argumentsList;
  }
  const receiverPassing = getCsharpArgumentPassing(receiverParameter.passingMode);
  const receiverArgument = {
    expression: planExpression(receiver, sourceFile, input, diagnostics),
    ...(receiverPassing === undefined ? {} : { passing: receiverPassing }),
  } satisfies CsharpArgument;
  return [
    ...argumentsList.slice(0, receiverArgumentIndex),
    receiverArgument,
    ...argumentsList.slice(receiverArgumentIndex),
  ];
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
  if (expression.Body?.Kind === KindBlock) {
    return {
      kind: "lambda",
      ...(isAsyncExpression(node) ? { async: true } : {}),
      parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
      body: {
        statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics),
      },
    };
  }
  return {
    kind: "lambda",
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
    kind: "lambda",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
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
  const assignments = mergeObjectInitializerAssignments((literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .flatMap((property) => planObjectLiteralAssignment(property, sourceFile, input, diagnostics)));
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
  return input.semantics.getObjectShapeForNode(expectedTypeSubject, { sourceFile });
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
  const assignments = mergeObjectInitializerAssignments((literal.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined)
    .flatMap((property) => planObjectShapeLiteralAssignment(property, objectShape, sourceFile, input, diagnostics)));
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
): readonly CsharpObjectInitializerAssignment[] {
  switch (property.Kind) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const sourceName = getObjectLiteralPropertySourceName(property, diagnostics);
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
      const sourceName = getObjectLiteralPropertySourceName(property, diagnostics);
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
  targetShape: ObjectShapeFact,
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
  if (expression.Kind !== KindIdentifier) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a single-evaluation provider lowering for non-identifier spread expressions before C# emission."));
    return [];
  }
  const sourceShape = input.semantics.getObjectShapeForNode(expression, { sourceFile });
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
      name: objectShapeStorageMemberName(targetShape, targetMember),
      expression: {
        kind: "member",
        receiver: planExpression(expression, sourceFile, input, diagnostics),
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      },
    });
  }
  return assignments;
}

function planObjectShapeMethodMemberAssignment(
  methodNode: Node,
  objectShape: ObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly name: string; readonly expression: CsharpExpression } | undefined {
  const sourceName = getObjectLiteralPropertySourceName(methodNode, diagnostics);
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
    kind: "lambda",
    ...(isAsyncExpression(methodNode) ? { async: true } : {}),
    parameters: planLambdaParameters(method.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      statements: planBlockStatements(method.Body, sourceFile, input, diagnostics),
    },
  };
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
  return isSourceOwnedProjectConstructibleObjectSubject(expectedTypeSubject, sourceFile, input);
}

function planObjectLiteralAssignment(
  property: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpObjectInitializerAssignment[] {
  switch (property.Kind) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      const name = getSourceOwnedObjectInitializerMemberName(property, diagnostics);
      if (name === undefined || propertyAssignment.Initializer === undefined) {
        if (propertyAssignment.Initializer === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(property, "Object literal property assignment must have an initializer."));
        }
        return [];
      }
      return [{
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
      const name = getSourceOwnedObjectInitializerMemberName(property, diagnostics);
      if (name === undefined || nameNode === undefined) {
        return [];
      }
      return [{
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

function objectShapeMemberTypesMatch(left: ObjectShapeFact["members"][number], right: ObjectShapeFact["members"][number]): boolean {
  return targetTypeRefsMatch(left.type, right.type);
}

function targetTypeRefsMatch(left: TargetTypeRef, right: TargetTypeRef): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListsMatch(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "nullable":
      return right.kind === "nullable" && targetTypeRefsMatch(left.inner, right.inner);
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefsMatch(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefListsMatch(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefsMatch(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListsMatch(left.args, right.args) &&
        targetTypeRefsMatch(left.result, right.result) &&
        stringListsMatch(left.abi ?? [], right.abi ?? []);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefsMatch(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        Object.is(left.value, right.value);
  }
}

function targetTypeRefListsMatch(left: readonly TargetTypeRef[], right: readonly TargetTypeRef[]): boolean {
  return left.length === right.length &&
    left.every((item, index) => targetTypeRefsMatch(item, right[index]!));
}

function stringListsMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}

function planSourceOwnedMethodMemberAssignment(
  methodNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly name: string; readonly expression: CsharpExpression } | undefined {
  const name = getSourceOwnedObjectInitializerMemberName(methodNode, diagnostics);
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
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = Node_Name(property);
  if (nameNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(property, "Source-owned object initializers require a property name."));
    return undefined;
  }
  if (nameNode.Kind === KindIdentifier) {
    return sanitizeIdentifier(Node_Text(nameNode));
  }
  if (nameNode.Kind === KindStringLiteral) {
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
  const literal = parseRegularExpressionLiteral(AsRegularExpressionLiteral(node)!.Text);
  if (literal === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal text could not be split into pattern and flags by the C# backend."));
    return invalidExpression("invalid regexp literal text");
  }
  return {
    kind: "new",
    type: csharpTypeFromTargetTypeRef(carrier) ?? { kind: "invalid", reason: "regexp carrier" },
    arguments: [
      { expression: { kind: "literal", value: literal.pattern } },
      { expression: { kind: "literal", value: literal.flags } },
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
  if ((literal.Elements?.Nodes ?? []).some((element) => element?.Kind === KindSpreadElement)) {
    return planArraySpreadLiteralExpression(node, sourceFile, input, diagnostics, elementType);
  }
  return {
    kind: "array",
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
  const expectedArrayType = { kind: "array", elementType } satisfies CsharpTypeNode;
  const chunks = createArraySpreadChunks(node, sourceFile, input, diagnostics, elementType, expectedArrayType);
  if (chunks.length === 0) {
    return {
      kind: "array",
      elementType,
      elements: [],
    };
  }
  if (chunks.length === 1 && chunks[0]?.fromSpread !== true) {
    return chunks[0]!.expression;
  }
  const first = chunks[0]!.expression;
  const concatenated = chunks.slice(1).reduce(
    (left, chunk) => systemLinqEnumerableCall("Concat", [
      { expression: left },
      { expression: chunk.expression },
    ]),
    first,
  );
  return systemLinqEnumerableCall("ToArray", [{ expression: concatenated }]);
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
        kind: "array",
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
    if (element.Kind !== KindSpreadElement) {
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

function systemLinqEnumerableCall(name: string, args: readonly CsharpArgument[]): CsharpExpression {
  return {
    kind: "call",
    callee: {
      kind: "member",
      receiver: {
        kind: "type",
        type: {
          kind: "qualified",
          left: {
            kind: "qualified",
            left: { kind: "named", name: "System" },
            name: "Linq",
          },
          name: "Enumerable",
        },
      },
      name,
    },
    arguments: args,
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
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics);
  if (typeTest !== undefined) {
    return typeTest;
  }
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
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
    kind: "isType",
    expression: planExpression(expression.Left, sourceFile, input, diagnostics),
    type: expressionToCsharpType(expression.Right, sourceFile, input, diagnostics),
  };
}

function tryPlanTypeofComparisonExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" ||
    (selectedOperator.targetOperation !== "typeof-is" && selectedOperator.targetOperation !== "typeof-is-not")) {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression.Left!, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return invalidExpression("selected typeof comparison without typeof operand");
  }
  const targetType = selectedOperator.targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(selectedOperator.targetType);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operand, "Provider selected a typeof comparison operation without a renderable target type."));
    return invalidExpression("selected typeof comparison without target type");
  }
  return {
    kind: "isType",
    expression: planExpression(operand, sourceFile, input, diagnostics),
    type: targetType,
    ...(selectedOperator.targetOperation === "typeof-is-not" ? { negated: true } : {}),
  };
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
): Node | undefined {
  if (expression.Left?.Kind === KindTypeOfExpression) {
    return Node_Expression(expression.Left);
  }
  if (expression.Right?.Kind === KindTypeOfExpression) {
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
