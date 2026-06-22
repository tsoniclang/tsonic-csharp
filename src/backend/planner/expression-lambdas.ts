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
) => CsharpExpression;

export function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
): CsharpExpression {
  const expression = AsArrowFunction(node)!;
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, expectedType);
  if (HasSourceKind(input.ast, expression.Body, KindBlock)) {
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(node) ? { async: true } : {}),
      parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state),
      body: {
        kind: "Block",
        statements: planBlockStatements(expression.Body, sourceFile, input, diagnostics, state),
      },
    };
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state),
    body: planExpression(expression.Body!, sourceFile, input, diagnostics),
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
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, expectedType);
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state),
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
        name: HasSourceKind(input.ast, parameter.name, KindIdentifier) && state !== undefined
          ? declareCsharpLocalBindingName(parameter.name, sourceFile, input, diagnostics, state, "Lambda parameter", "arg")
          : HasSourceKind(input.ast, parameter.name, KindIdentifier)
            ? requireCsharpIdentifier(Node_Text(parameter.name), diagnostics, "Lambda parameter")
            : "arg",
        ...(parameter.Type === undefined ? {} : { type: getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics) }),
      };
    });
}

export function diagnoseMissingLambdaTargetContext(
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
