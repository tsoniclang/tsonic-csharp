import {
  AsArrowFunction,
  AsFunctionExpression,
  AsParameterDeclaration,
  HasSourceKind,
  HasSyntacticModifier,
  KindBlock,
  KindIdentifier,
  Node_Text,
  ModifierFlagsAsync,
  isAstNode,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpLambdaParameter, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  asSemanticType,
  asTargetTypeRef,
} from "../../source/fact-subjects.js";
import {
  declareCsharpLocalBindingName,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { getTargetTypeRefForNode, getTargetTypeRefForType } from "./runtime-carriers.js";
import { planBlockStatements } from "./statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression | undefined;

export function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const expression = AsArrowFunction(node)!;
  const targetType = getLambdaTargetContext(node, sourceFile, input, expectedType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetType);
  if (HasSourceKind(input.ast, expression.Body, KindBlock)) {
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(node) ? { async: true } : {}),
      parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state, targetType),
      body: {
        kind: "Block",
        statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics, state),
      },
    };
  }
  const body = planExpression(expression.Body!, sourceFile, input, diagnostics);
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state, targetType),
    body,
  };
}

export function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
): CsharpExpression {
  const expression = AsFunctionExpression(node)!;
  const targetType = getLambdaTargetContext(node, sourceFile, input, expectedType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetType);
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state, targetType),
    body: {
      kind: "Block",
      statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics, state),
    },
  };
}

export function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
  expectedType?: CsharpTypeNode,
): readonly CsharpLambdaParameter[] {
  const expectedParameterTypes = getDelegateParameterTypes(expectedType);
  return parameterNodes
    .filter((parameterNode): parameterNode is Node => parameterNode !== undefined)
    .map((parameterNode, index): CsharpLambdaParameter => {
      const parameter = AsParameterDeclaration(parameterNode)!;
      diagnoseTypeScriptOnlyRuntimeShapeModifiers(parameterNode, "lambda parameter declaration", diagnostics);
      if (parameter.DotDotDotToken !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameterNode, "Rest parameters in lambdas require target delegate facts before C# emission."));
      }
      if (!HasSourceKind(input.ast, parameter.name, KindIdentifier)) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode, "Lambda parameter binding is outside the current C# planning surface."));
      }
      const expectedParameterType = expectedParameterTypes[index];
      const explicitParameterType = parameter.Type === undefined
        ? undefined
        : getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics);
      return {
        kind: "Parameter",
        name: HasSourceKind(input.ast, parameter.name, KindIdentifier) && state !== undefined
          ? declareCsharpLocalBindingName(parameter.name, sourceFile, input, diagnostics, state, "Lambda parameter", "arg")
          : HasSourceKind(input.ast, parameter.name, KindIdentifier)
            ? requireCsharpIdentifier(Node_Text(parameter.name), diagnostics, "Lambda parameter")
            : "arg",
        ...(expectedParameterType !== undefined
          ? { type: expectedParameterType }
          : explicitParameterType === undefined
            ? {}
            : { type: explicitParameterType }),
      };
    });
}

function getDelegateParameterTypes(expectedType: CsharpTypeNode | undefined): readonly CsharpTypeNode[] {
  const type = expectedType?.kind === "NullableType" ? expectedType.inner : expectedType;
  if (type === undefined) {
    return [];
  }
  const typeName = csharpTypeName(type);
  const typeArguments = csharpTypeArguments(type);
  if (typeName === "Action") {
    return typeArguments;
  }
  if (typeName === "Func" && typeArguments.length > 0) {
    return typeArguments.slice(0, -1);
  }
  if (typeName === "Predicate" && typeArguments.length === 1) {
    return typeArguments;
  }
  return [];
}

export function diagnoseMissingLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): void {
  if (getLambdaTargetContext(node, sourceFile, input, expectedType) !== undefined) {
    return;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Lambda emission requires a contextual function/delegate type from TSTS or provider facts before C# emission."));
}

export function getLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  expectedType?: CsharpTypeNode,
): CsharpTypeNode | undefined {
  if (expectedType !== undefined && isCsharpDelegateType(expectedType)) {
    return expectedType;
  }
  const contextualType = getContextualTargetCsharpType(node, sourceFile, input);
  if (contextualType !== undefined && isCsharpDelegateType(contextualType)) {
    return contextualType;
  }
  return undefined;
}

export function isCsharpDelegateType(type: CsharpTypeNode): boolean {
  if (type.kind === "NullableType") {
    return isCsharpDelegateType(type.inner);
  }
  return csharpTypeName(type) === "Func" || csharpTypeName(type) === "Action" || csharpTypeName(type) === "Predicate";
}

export function isAsyncExpression(node: Node): boolean {
  return HasSyntacticModifier(node, ModifierFlagsAsync);
}

function getContextualTargetCsharpType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const fact = input.facts.getContextualTargetTypeFact(node);
  const targetType = fact?.targetType ?? getContextualTargetRefFromSubject(fact?.type, sourceFile, input);
  const csharpType = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  return undefined;
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
  return isAstNode(subject)
    ? getTargetTypeRefForNode(input, subject, sourceFile)
    : undefined;
}

function csharpTypeName(type: CsharpTypeNode): string | undefined {
  switch (type.kind) {
    case "IdentifierName":
    case "QualifiedName":
      return type.name;
    default:
      return undefined;
  }
}

function csharpTypeArguments(type: CsharpTypeNode | undefined): readonly CsharpTypeNode[] {
  switch (type?.kind) {
    case "IdentifierName":
    case "QualifiedName":
      return type.typeArguments ?? [];
    default:
      return [];
  }
}
