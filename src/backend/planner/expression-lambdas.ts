import {
  AsArrowFunction,
  AsFunctionExpression,
  AsParameterDeclaration,
  HasSourceKind,
  HasSyntacticModifier,
  KindArrowFunction,
  KindBlock,
  KindFunctionExpression,
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
import type {
  CsharpDelegateSignatureShape,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  csharpDelegateTargetType,
  isCsharpVoidTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export interface LambdaTargetContext {
  readonly type: CsharpTypeNode;
  readonly signature: {
    readonly parameters: readonly CsharpTypeNode[];
    readonly returnType?: CsharpTypeNode;
  };
}

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
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expression = AsArrowFunction(node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const parameters = planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state, targetContext);
  if (HasSourceKind(input.ast, expression.Body, KindBlock)) {
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(node) ? { async: true } : {}),
      parameters,
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
    parameters,
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
  expectedTargetType?: TargetTypeRef,
): CsharpExpression {
  const expression = AsFunctionExpression(node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state, targetContext),
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
  expectedContext?: LambdaTargetContext,
): readonly CsharpLambdaParameter[] {
  const expectedParameterTypes = expectedContext?.signature.parameters ?? [];
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

export function diagnoseMissingLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedContext?: LambdaTargetContext,
): void {
  if (expectedContext !== undefined || getLambdaTargetContext(node, sourceFile, input) !== undefined) {
    return;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, "Lambda emission requires a contextual function/delegate type from TSTS or provider facts before C# emission."));
}

export function getLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  expectedType?: CsharpTypeNode,
  expectedTargetType?: TargetTypeRef,
): LambdaTargetContext | undefined {
  if (!HasSourceKind(input.ast, node, KindArrowFunction) && !HasSourceKind(input.ast, node, KindFunctionExpression)) {
    return undefined;
  }
  const expectedTargetContext = lambdaTargetContextFromTargetRef(expectedTargetType);
  if (expectedTargetContext !== undefined) {
    return expectedTargetContext;
  }
  void expectedType;
  const explicitSignatureContext = getExplicitLambdaSignatureTarget(node, sourceFile, input);
  if (explicitSignatureContext !== undefined) {
    return explicitSignatureContext;
  }
  const contextualTarget = getContextualTargetRef(node, sourceFile, input);
  const contextualTargetContext = lambdaTargetContextFromTargetRef(contextualTarget);
  if (contextualTargetContext !== undefined) {
    return contextualTargetContext;
  }
  return undefined;
}

function getExplicitLambdaSignatureTarget(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): LambdaTargetContext | undefined {
  const expression = AsArrowFunction(node) ?? AsFunctionExpression(node);
  if (expression === undefined) {
    return undefined;
  }
  const parameterTypes = (expression.Parameters?.Nodes ?? []).map((parameterNode) => {
    const parameter = AsParameterDeclaration(parameterNode);
    return parameter?.Type === undefined
      ? undefined
      : getCsharpTypeForNode(parameter.Type, sourceFile, input);
  });
  if (!parameterTypes.every((parameterType): parameterType is CsharpTypeNode => parameterType !== undefined && parameterType.kind !== "InvalidType")) {
    return undefined;
  }
  const returnType = expression.Type === undefined
    ? undefined
    : getCsharpTypeForNode(expression.Type, sourceFile, input);
  if (returnType === undefined || returnType.kind === "InvalidType") {
    return undefined;
  }
  if (returnType.kind === "PredefinedType" && returnType.name === "void") {
    const targetType = csharpDelegateTargetType(
      "System.Action",
      (expression.Parameters?.Nodes ?? [])
        .map((parameterNode) => AsParameterDeclaration(parameterNode)?.Type)
        .filter((typeNode): typeNode is Node => typeNode !== undefined)
        .map((typeNode) => getTargetTypeRefForNode(input, typeNode, sourceFile))
        .filter((type): type is TargetTypeRef => type !== undefined),
    );
    const context = lambdaTargetContextFromTargetRef(targetType);
    return context ?? {
      type: {
        kind: "IdentifierName",
        name: "Action",
        ...(parameterTypes.length === 0 ? {} : { typeArguments: parameterTypes }),
      },
      signature: { parameters: parameterTypes },
    };
  }
  return {
    type: {
      kind: "IdentifierName",
      name: "Func",
      typeArguments: [...parameterTypes, returnType],
    },
    signature: {
      parameters: parameterTypes,
      returnType,
    },
  };
}

export function csharpDelegateSignatureFromTargetTypeRef(
  type: TargetTypeRef | undefined,
): CsharpDelegateSignatureShape | undefined {
  const signature = type?.kind === "target-named"
    ? (type as { readonly csharpDelegateSignature?: CsharpDelegateSignatureShape }).csharpDelegateSignature
    : undefined;
  return signature?.returnType === undefined ? undefined : signature;
}

export function lambdaTargetContextFromTargetRef(type: TargetTypeRef | undefined): LambdaTargetContext | undefined {
  const signature = csharpDelegateSignatureFromTargetTypeRef(type);
  if (signature === undefined || type === undefined) {
    return undefined;
  }
  const targetType = csharpTypeFromTargetTypeRef(type);
  if (targetType === undefined) {
    return undefined;
  }
  const parameters = signature.parameters.map(csharpTypeFromTargetTypeRef);
  const returnType = csharpTypeFromTargetTypeRef(signature.returnType);
  if (parameters.some((parameter) => parameter === undefined) || returnType === undefined) {
    return undefined;
  }
  return {
    type: targetType,
    signature: {
      parameters: parameters as readonly CsharpTypeNode[],
      ...(isCsharpVoidTargetType(signature.returnType) ? {} : { returnType }),
    },
  };
}

export function isAsyncExpression(node: Node): boolean {
  return HasSyntacticModifier(node, ModifierFlagsAsync);
}

function getContextualTargetRef(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  const fact = input.facts.getContextualTargetTypeFact(node);
  return fact?.targetType ?? getContextualTargetRefFromSubject(fact?.type, sourceFile, input);
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
