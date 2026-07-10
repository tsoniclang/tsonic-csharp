import type { ArgumentPassingFact, Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  getCsharpDelegateSignature,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  isAstNode,
  SourceKind,
  HasSourceKind,
  KindArrowFunction,
  KindFunctionExpression,
} from "./source-ast.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
import {
  isSourceOwnedCallableRuntimeCarrierSubject,
} from "./semantic-source-ownership.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression | undefined;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  expectedTargetType?: TargetTypeRef,
) => CsharpExpression | undefined;

export function planCallArgumentCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  expectedArgumentPassingMode: ArgumentPassingFact["mode"] = "by-value",
  state?: DestructuringPlannerState,
): CsharpArgument | undefined {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    if (expectedArgumentPassingMode !== "by-value") {
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission requires finalized argument-passing facts for selected ${expectedArgumentPassingMode} parameters.`));
      return undefined;
    }
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  if (!csharpSupportsArgumentPassingMode(argumentPassing.mode)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${argumentPassing.mode}'.`));
    return undefined;
  }
  if (argumentPassing.mode !== expectedArgumentPassingMode) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Finalized argument-passing fact '${argumentPassing.mode}' does not match the selected call parameter mode '${expectedArgumentPassingMode}'.`));
    return undefined;
  }
  if (!isAstNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return undefined;
  }
  const passing = getCsharpArgumentPassing(argumentPassing.mode, node, diagnostics);
  if (argumentPassing.mode !== "by-value" && passing === undefined) {
    return undefined;
  }
  const expression = planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
  if (expression === undefined) {
    return undefined;
  }
  return {
    kind: "Argument",
    expression,
    ...(passing !== undefined ? { passing } : {}),
  };
}

function planCallArgumentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (expectedType !== undefined && conversionExpectedTargetType !== undefined) {
    if (HasSourceKind(input.ast, node, KindArrowFunction)) {
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression, expectedType, state, conversionExpectedTargetType, planExpressionWithExpectedType);
    }
    if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
      return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, state, conversionExpectedTargetType);
    }
  }
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion?.operation !== undefined) {
    return planExpression(node, sourceFile, input, diagnostics);
  }
  if (conversion?.convertedType !== undefined) {
    const delegateConversion = tryPlanSourceOwnedDelegateConversion(
      node,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      conversion.convertedType,
    );
    if (delegateConversion.kind === "planned") {
      return delegateConversion.expression;
    }
    if (delegateConversion.kind === "failed") {
      return undefined;
    }
    const convertedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (convertedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return undefined;
    }
    if (
      conversionExpectedTargetType !== undefined &&
      !targetTypeRefEquals(conversion.convertedType, conversionExpectedTargetType)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(node, `Selected target argument conversion fact does not match the selected call parameter type. Node kind: ${SourceKind(input.ast, node)}. Conversion target: ${targetTypeRefKey(conversion.convertedType)}. Selected parameter target: ${targetTypeRefKey(conversionExpectedTargetType)}.`));
      return undefined;
    }
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType ?? convertedType, expectedTypeSubject, conversion.convertedType);
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType);
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

type DelegateConversionPlan =
  | { readonly kind: "not-delegate" }
  | { readonly kind: "planned"; readonly expression: CsharpExpression }
  | { readonly kind: "failed" };

function tryPlanSourceOwnedDelegateConversion(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  convertedType: TargetTypeRef,
): DelegateConversionPlan {
  const targetSignature = getCsharpDelegateSignature(convertedType);
  if (targetSignature === undefined) {
    return { kind: "not-delegate" };
  }
  const sourceType = getTargetTypeRefForNode(input, node, sourceFile);
  const sourceSignature = getCsharpDelegateSignature(sourceType);
  if (sourceType === undefined || sourceSignature === undefined || targetTypeRefEquals(sourceType, convertedType)) {
    return { kind: "not-delegate" };
  }
  if (!delegateSignaturesMatch(sourceSignature, targetSignature)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target delegate conversion requires matching finalized source and target delegate signatures before C# emission."));
    return { kind: "failed" };
  }
  if (!isSourceOwnedCallableRuntimeCarrierSubject(node, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target delegate conversion requires a source-owned callable reference; provider-owned delegate values require explicit provider conversion metadata."));
    return { kind: "failed" };
  }
  const callee = planExpression(node, sourceFile, input, diagnostics);
  if (callee === undefined) {
    return { kind: "failed" };
  }
  const parameters = targetSignature.parameters.map((_, index) => ({
    kind: "Parameter" as const,
    name: `__tsonic_arg${index}`,
  }));
  return {
    kind: "planned",
    expression: {
      kind: "LambdaExpression",
      parameters,
      body: {
        kind: "InvocationExpression",
        callee,
        arguments: parameters.map((parameter) => ({
          kind: "Argument" as const,
          expression: { kind: "IdentifierName" as const, name: parameter.name },
        })),
      },
    },
  };
}

function delegateSignaturesMatch(
  source: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
  target: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
): boolean {
  return source.parameters.length === target.parameters.length &&
    source.parameters.every((parameter, index) => {
      const targetParameter = target.parameters[index];
      return targetParameter !== undefined && targetTypeRefEquals(parameter, targetParameter);
    }) &&
    targetTypeRefEquals(source.returnType, target.returnType);
}

function csharpSupportsArgumentPassingMode(
  mode: ArgumentPassingFact["mode"],
): boolean {
  switch (mode) {
    case "by-value":
    case "byref-writeonly-must-init":
    case "byref-readwrite":
    case "byref-readonly":
      return true;
    case "borrow-shared":
    case "borrow-mut":
    case "move":
      return false;
  }
}

function getCsharpArgumentPassing(
  mode: ArgumentPassingFact["mode"],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpArgument["passing"] {
  switch (mode) {
    case "by-value":
      return undefined;
    case "byref-writeonly-must-init":
      return "out";
    case "byref-readwrite":
      return "ref";
    case "byref-readonly":
      return "in";
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${mode}'.`));
      return undefined;
  }
}
