import {
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
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  AsStringLiteral,
  AsSatisfiesExpression,
  AsTemplateExpression,
  AsTemplateSpan,
  AsTypeAssertion,
  KindArrowFunction,
  KindAsExpression,
  KindBlock,
  KindCallExpression,
  KindClassDeclaration,
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
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { ArgumentPassingFact, Node, SourceFile, TargetMember, TargetOperationFact, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpInterpolatedStringPart, CsharpLambdaParameter, CsharpObjectInitializerAssignment, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  planArrayLiteralExpression,
  planArrayLiteralExpressionFromFacts,
  planTupleLiteralExpression,
} from "./array-literals.js";
import { expressionToCsharpType, getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { getTargetTypeRefForNode, getTargetTypeRefForType } from "./runtime-carriers.js";
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
import { instantiateSelectedTargetMember } from "./target-member-instantiation.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import {
  applyTargetConversionFact,
  splitQualifiedTargetOperation,
} from "./target-conversions.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";

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
        : instantiateSelectedTargetMember(node, expression.Expression, selectedTargetCall, sourceFile, input);
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

function isProjectSourceTypeRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-specific" &&
    type.target === "csharp" &&
    type.name === "project-source-type";
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
  const referenceTargetBinding = input.semantics.getTargetBindingForReference(identifier, { sourceFile });
  if (referenceTargetBinding !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const directSymbol = input.semantics.getSymbolAtLocation(identifier, { sourceFile });
  const resolvedSymbol = input.semantics.getResolvedSymbol(identifier, { sourceFile });
  const directTargetBinding = input.facts.getTargetBindingFact(directSymbol) ??
    input.facts.getTargetBindingFact(resolvedSymbol);
  if (
    directTargetBinding !== undefined ||
    isProviderVirtualDeclarationIdentifier(identifier, sourceFile, input)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(identifier, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  return { kind: "IdentifierName", name: sanitizeIdentifier(sourceName) };
}

function isProviderVirtualDeclarationIdentifier(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const symbols = [
    input.semantics.getSymbolAtLocation(identifier, { sourceFile }),
    input.semantics.getResolvedSymbol(identifier, { sourceFile }),
  ];
  return symbols.some((symbol) => {
    if (symbol === undefined) {
      return false;
    }
    if (input.facts.getTargetBindingFact(symbol) !== undefined) {
      return true;
    }
    const declarations = getSymbolDeclarations(symbol);
    return declarations.some((declaration) =>
      input.facts.getFact(declaration, providerVirtualDeclarationFactKey) !== undefined ||
      isProviderVirtualSourceFile(input.ast.getSourceFile(declaration)));
  });
}

function getSymbolDeclarations(symbol: unknown): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined
      ? []
      : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

function isProviderVirtualSourceFile(sourceFile: SourceFile | undefined): boolean {
  return sourceFile !== undefined &&
    (sourceFile.IsDeclarationFile || SourceFile_FileName(sourceFile).startsWith("tsts-provider://"));
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
    (reference.sourceFile.IsDeclarationFile ||
      SourceFile_FileName(reference.sourceFile).startsWith("tsts-provider://") ||
      SourceFile_FileName(reference.sourceFile).includes("/node_modules/") ||
      SourceFile_FileName(reference.sourceFile).endsWith(".d.ts"));
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
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(node, { sourceFile }) ??
    getProjectSourceReferenceForPropertyAccessName(node, sourceFile, input);
  if (sourceReference === undefined || sourceReference.sourceFile === sourceFile) {
    return undefined;
  }
  if (isExternalDeclarationReference(sourceReference, sourceFile)) {
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

function getProjectSourceReferenceForPropertyAccessName(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]> {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const name = AsPropertyAccessExpression(node)?.name;
  return name === undefined
    ? undefined
    : input.semantics.getProjectSourceReferenceForNode(name, { sourceFile });
}

function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
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
    const member = instantiateSelectedTargetMember(node, expression.Expression, selectedTargetCall, sourceFile, input);
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
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, expectedType);
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
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, expectedType);
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
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): void {
  if (expectedType !== undefined && isCsharpDelegateType(expectedType)) {
    return;
  }
  const contextualType = getContextualTargetCsharpType(node, sourceFile, input);
  if (contextualType !== undefined && isCsharpDelegateType(contextualType)) {
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
    return planArrowFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType);
  }
  if (HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    return planObjectLiteralExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
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

function planObjectLiteralExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
): CsharpExpression {
  const objectShape = getExpectedObjectShapeFact(expectedTypeSubject, sourceFile, input) ??
    getExpectedObjectShapeFact(node, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectLiteralExpressionWithObjectShape(node, sourceFile, input, diagnostics, objectShape);
  }
  void expectedType;
  diagnostics.push(unsupportedNodeDiagnostic(node, "Object literal emission requires finalized TSTS/provider object-shape facts before C# emission."));
  return invalidExpression("object literal without finalized object-shape facts");
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
  diagnoseMissingLambdaTargetContext(methodNode, sourceFile, input, diagnostics, expectedType);
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

function getContextualTargetCsharpType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const fact = input.facts.getContextualTargetTypeFact(node);
  const targetType = fact?.targetType ?? getContextualTargetRefFromSubject(fact?.type, sourceFile, input);
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function getContextualTargetRefFromSubject(
  subject: unknown,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  const targetRef = asTargetTypeRef(subject);
  if (targetRef !== undefined) {
    return targetRef;
  }
  const type = asSemanticType(subject);
  if (type !== undefined) {
    return getTargetTypeRefForType(input, type, sourceFile);
  }
  return isNode(subject)
    ? getTargetTypeRefForNode(input, subject, sourceFile)
    : undefined;
}

function asSemanticType(subject: unknown): Type | undefined {
  return typeof subject === "object" && subject !== null && "flags" in subject ? subject as Type : undefined;
}

function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  switch ((subject as { readonly kind?: unknown }).kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}

function getObjectLiteralPropertySourceName(
  property: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = input.ast.name(property) ?? Node_Name(property);
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
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
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
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
  }
  return {
    kind: "BinaryExpression",
    left: planExpression(left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(right!, sourceFile, input, diagnostics),
  };
}

function getBinaryLeft(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Left ?? (expression as { readonly left?: Node }).left;
}

function getBinaryRight(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Right ?? (expression as { readonly right?: Node }).right;
}

function getBinaryOperatorToken(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): unknown {
  return expression.OperatorToken?.Kind ??
    (expression as { readonly operatorToken?: { readonly Kind?: unknown } | unknown }).operatorToken ??
    (expression as { readonly Operator?: unknown; readonly operator?: unknown }).Operator ??
    (expression as { readonly operator?: unknown }).operator;
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
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a type-test operation, but the expression is missing an operand."));
    return invalidExpression("selected type-test without operands");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(left, sourceFile, input, diagnostics),
    type: expressionToCsharpType(right, sourceFile, input, diagnostics),
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
    (!selectedOperator.targetOperation.startsWith("typeof-is:") && !selectedOperator.targetOperation.startsWith("typeof-is-not:"))) {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression, _input);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return invalidExpression("selected typeof comparison without typeof operand");
  }
  const targetKind = selectedOperator.targetOperation.slice(selectedOperator.targetOperation.indexOf(":") + 1);
  const targetType = getTypeofComparisonTargetType(targetKind);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operand, `Provider selected unsupported typeof comparison target '${targetKind}'.`));
    return invalidExpression("selected typeof comparison target");
  }
  const test: CsharpExpression = {
    kind: "IsPatternExpression",
    expression: planExpression(operand, _sourceFile, _input, diagnostics),
    type: targetType,
    ...(selectedOperator.targetOperation.startsWith("typeof-is-not:") ? { negated: true } : {}),
  };
  return test;
}

function getTypeofComparisonTargetType(kind: string): CsharpTypeNode | undefined {
  switch (kind) {
    case "string":
      return predefined("string");
    case "number":
      return predefined("double");
    case "boolean":
      return predefined("bool");
    case "bigint":
      return csharpTypeFromTargetTypeRef({ kind: "target-named", id: "System.Numerics.BigInteger" });
    default:
      return undefined;
  }
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  input: TargetCompileInput,
): Node | undefined {
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (HasSourceKind(input.ast, left, KindTypeOfExpression)) {
    return Node_Expression(left);
  }
  if (HasSourceKind(input.ast, right, KindTypeOfExpression)) {
    return Node_Expression(right);
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
  const tokenKind = SourceTokenKind(input.ast, getBinaryOperatorToken(expression));
  const targetAssignment = getTargetOwnedAssignmentOperator(tokenKind, expression, sourceFile, input);
  if (targetAssignment !== undefined) {
    return targetAssignment;
  }
  const targetNullish = getTargetOwnedNullishOperator(tokenKind, expression, sourceFile, input);
  if (targetNullish !== undefined) {
    return targetNullish;
  }
  const targetEquality = getTargetOwnedEqualityOperator(tokenKind, expression, sourceFile, input);
  if (targetEquality !== undefined) {
    return targetEquality;
  }
  const ownership = combineOwnership(
    getProviderOperationOwnership(getBinaryLeft(expression), sourceFile, input),
    getProviderOperationOwnership(getBinaryRight(expression), sourceFile, input),
  );
  if (!ownership.sourceOwned) {
    return undefined;
  }
  switch (tokenKind) {
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

function getTargetOwnedAssignmentOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (tokenKind !== "KindEqualsToken") {
    return undefined;
  }
  const leftNode = getBinaryLeft(expression);
  const rightNode = getBinaryRight(expression);
  const left = getTargetTypeRefForNode(input, leftNode, sourceFile);
  const right = getTargetTypeRefForNode(input, rightNode, sourceFile);
  if (left === undefined) {
    return undefined;
  }
  if (isNullLiteral(rightNode, input)) {
    return "=";
  }
  if (right === undefined) {
    return undefined;
  }
  return targetTypeRefsMatch(left, right)
    ? "="
    : undefined;
}

function getTargetOwnedNullishOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (tokenKind !== "KindQuestionQuestionToken") {
    return undefined;
  }
  const left = getTargetTypeRefForNode(input, getBinaryLeft(expression), sourceFile);
  const right = getTargetTypeRefForNode(input, getBinaryRight(expression), sourceFile);
  return left !== undefined && right !== undefined ? "??" : undefined;
}

function getTargetOwnedEqualityOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  const equality = tokenKind === "KindEqualsEqualsToken" || tokenKind === "KindEqualsEqualsEqualsToken";
  const inequality = tokenKind === "KindExclamationEqualsToken" || tokenKind === "KindExclamationEqualsEqualsToken";
  if (!equality && !inequality) {
    return undefined;
  }
  const left = getTargetTypeRefForNode(input, getBinaryLeft(expression), sourceFile);
  const right = getTargetTypeRefForNode(input, getBinaryRight(expression), sourceFile);
  if (left === undefined || right === undefined || !targetTypeRefsMatch(left, right) || !isProjectSourceTypeRef(left)) {
    return undefined;
  }
  return equality ? "==" : "!=";
}

function isNullLiteral(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindNullKeyword);
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
