import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  createCsharpScopedTranslationContext,
} from "../../translate/context/index.js";
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
} from "./source-ast.js";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpBlock, CsharpExpression, CsharpLambdaParameter, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  createDestructuringPlannerState,
  declareCsharpLocalBindingName,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import { planBlockStatements } from "./statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type {
  CsharpDelegateSignatureShape,
} from "../../policy/types/index.js";
import type {
  ExpectedExpressionPlanner,
} from "./expression-planner-types.js";
import {
  csharpDelegateTargetType,
  csharpSourceTypeArgumentNodes,
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpVoidTargetType,
  targetTypeRefEquals,
} from "../../policy/types/index.js";

export interface LambdaTargetContext {
  readonly type: CsharpTypeNode;
  readonly signature: {
    readonly parameters: readonly CsharpTypeNode[];
    readonly parameterTargetTypes: readonly TargetTypeRef[];
    readonly returnType?: CsharpTypeNode;
    readonly returnTargetType?: TargetTypeRef;
  };
}

type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression | undefined;

export function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
  planExpressionWithExpectedType?: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsArrowFunction(node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const returnContext = getLambdaReturnContext(node, targetContext, input, diagnostics);
  if (isAsyncExpression(input.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const scopedInput = createLambdaTranslationContext(
    expression.Parameters?.Nodes ?? [],
    sourceFile,
    input,
    diagnostics,
    targetContext,
  );
  if (scopedInput === undefined) {
    return undefined;
  }
  const parameters = planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, scopedInput, diagnostics, state, targetContext);
  if (HasSourceKind(input.ast, expression.Body, KindBlock)) {
    const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, state, targetContext, returnContext);
    if (body === undefined) {
      return undefined;
    }
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(input.ast, node) ? { async: true } : {}),
      parameters,
      body,
    };
  }
  const body = returnContext !== undefined && planExpressionWithExpectedType !== undefined
    ? planExpressionWithExpectedType(
      expression.Body!,
      sourceFile,
      scopedInput,
      diagnostics,
      returnContext.returnExpressionType,
      returnContext.returnExpressionTypeSubject,
      returnContext.returnExpressionTargetType,
    )
    : planExpression(expression.Body!, sourceFile, scopedInput, diagnostics);
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.ast, node) ? { async: true } : {}),
    parameters,
    body,
  };
}

export function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expression = AsFunctionExpression(node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const returnContext = getLambdaReturnContext(node, targetContext, input, diagnostics);
  if (isAsyncExpression(input.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const scopedInput = createLambdaTranslationContext(
    expression.Parameters?.Nodes ?? [],
    sourceFile,
    input,
    diagnostics,
    targetContext,
  );
  if (scopedInput === undefined) {
    return undefined;
  }
  const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, state, targetContext, returnContext);
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.ast, node) ? { async: true } : {}),
    parameters: planLambdaParameters(expression.Parameters?.Nodes ?? [], sourceFile, scopedInput, diagnostics, state, targetContext),
    body,
  };
}

export interface LambdaReturnContext {
  readonly returnExpressionType: CsharpTypeNode;
  readonly returnExpressionTypeSubject?: Node;
  readonly returnExpressionTargetType?: TargetTypeRef;
}

export function planLambdaBlockBody(
  lambdaNode: Node,
  bodyNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  targetContext: LambdaTargetContext | undefined,
  returnContext: LambdaReturnContext | undefined = getLambdaReturnContext(lambdaNode, targetContext, input, diagnostics),
): CsharpBlock | undefined {
  if (isAsyncExpression(input.ast, lambdaNode) && returnContext === undefined) {
    return undefined;
  }
  const lambdaState = state ?? createDestructuringPlannerState(lambdaNode, input.ast);
  const previousReturnExpressionType = lambdaState.currentReturnExpressionType;
  const previousReturnExpressionTypeSubject = lambdaState.currentReturnExpressionTypeSubject;
  const previousReturnExpressionTargetType = lambdaState.currentReturnExpressionTargetType;
  if (returnContext !== undefined) {
    lambdaState.currentReturnExpressionType = returnContext.returnExpressionType;
    lambdaState.currentReturnExpressionTypeSubject = returnContext.returnExpressionTypeSubject;
    lambdaState.currentReturnExpressionTargetType = returnContext.returnExpressionTargetType;
  }
  try {
    return { kind: "Block", statements: planBlockStatements(bodyNode, sourceFile, input, diagnostics, lambdaState) };
  } finally {
    lambdaState.currentReturnExpressionType = previousReturnExpressionType;
    lambdaState.currentReturnExpressionTypeSubject = previousReturnExpressionTypeSubject;
    lambdaState.currentReturnExpressionTargetType = previousReturnExpressionTargetType;
  }
}

function getLambdaReturnContext(
  node: Node,
  targetContext: LambdaTargetContext | undefined,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): LambdaReturnContext | undefined {
  if (targetContext === undefined) {
    return undefined;
  }
  if (!isAsyncExpression(input.ast, node)) {
    const returnExpressionType = targetContext.signature.returnType;
    if (returnExpressionType === undefined) {
      return undefined;
    }
    const returnExpressionTypeSubject = getAuthoredLambdaReturnTypeNode(node);
    return {
      returnExpressionType,
      ...(returnExpressionTypeSubject === undefined ? {} : { returnExpressionTypeSubject }),
      ...(targetContext.signature.returnTargetType === undefined
        ? {}
        : { returnExpressionTargetType: targetContext.signature.returnTargetType }),
    };
  }
  const returnTargetType = targetContext.signature.returnTargetType;
  const resultTargetType = getCsharpTaskResultTargetType(returnTargetType);
  if (resultTargetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Async lambda emission requires a finalized Task/Promise-returning delegate carrier fact before C# emission.",
    ));
    return undefined;
  }
  const returnExpressionType = csharpTypeFromTargetTypeRef(resultTargetType);
  if (returnExpressionType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Async lambda emission requires a renderable Task/Promise result carrier before C# emission.",
    ));
    return undefined;
  }
  const returnExpressionTypeSubject = getAsyncLambdaReturnExpressionSubject(node, input);
  return {
    returnExpressionType,
    ...(returnExpressionTypeSubject === undefined ? {} : { returnExpressionTypeSubject }),
    returnExpressionTargetType: resultTargetType,
  };
}

function getAuthoredLambdaReturnTypeNode(node: Node): Node | undefined {
  return (AsArrowFunction(node) ?? AsFunctionExpression(node))?.Type;
}

export function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
  expectedContext?: LambdaTargetContext,
): readonly CsharpLambdaParameter[] {
  const expectedParameterTypes = expectedContext?.signature.parameters ?? [];
  const sourceParameters = parameterNodes
    .filter((parameterNode): parameterNode is Node => parameterNode !== undefined)
    .map((parameterNode, index): CsharpLambdaParameter => {
      const parameter = AsParameterDeclaration(parameterNode)!;
      diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, parameterNode, "lambda parameter declaration", diagnostics);
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
          ? declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Lambda parameter", "arg")
          : HasSourceKind(input.ast, parameter.name, KindIdentifier)
            ? requireCsharpIdentifier(Node_Text(input.ast, parameter.name), diagnostics, "Lambda parameter")
            : "arg",
        ...(explicitParameterType !== undefined
          ? { type: explicitParameterType }
          : expectedParameterType === undefined
            ? {}
            : { type: expectedParameterType }),
      };
    });
  const omittedTargetParameters = expectedParameterTypes
    .slice(sourceParameters.length)
    .map((type): CsharpLambdaParameter => ({
      kind: "Parameter",
      name: "_",
      type,
    }));
  return [...sourceParameters, ...omittedTargetParameters];
}

export function diagnoseMissingLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
  const parameterTargetTypes = (expression.Parameters?.Nodes ?? []).map(
    (parameterNode) => {
      const parameter = AsParameterDeclaration(parameterNode);
      return parameter?.Type === undefined
        ? undefined
        : getTargetTypeRefForNode(input, parameter.Type, sourceFile);
    },
  );
  if (!parameterTargetTypes.every(
    (parameterType): parameterType is TargetTypeRef => parameterType !== undefined,
  )) {
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
      signature: {
        parameters: parameterTypes,
        parameterTargetTypes,
        returnTargetType: csharpVoidTargetType(),
      },
    };
  }
  const returnTargetType = expression.Type === undefined
    ? undefined
    : getTargetTypeRefForNode(input, expression.Type, sourceFile);
  return {
    type: {
      kind: "IdentifierName",
      name: "Func",
      typeArguments: [...parameterTypes, returnType],
    },
    signature: {
      parameters: parameterTypes,
      parameterTargetTypes,
      returnType,
      ...(returnTargetType === undefined ? {} : { returnTargetType }),
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
      parameterTargetTypes: signature.parameters,
      ...(isCsharpVoidTargetType(signature.returnType) ? {} : { returnType }),
      returnTargetType: signature.returnType,
    },
  };
}

function createLambdaTranslationContext(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  targetContext: LambdaTargetContext | undefined,
): CsharpTranslationContext | undefined {
  if (targetContext === undefined) {
    return input;
  }
  const sourceParameters = parameterNodes.filter(
    (parameterNode): parameterNode is Node => parameterNode !== undefined,
  );
  if (
    sourceParameters.length >
      targetContext.signature.parameterTargetTypes.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      sourceParameters[targetContext.signature.parameterTargetTypes.length]!,
      "The source lambda declares more parameters than its exact selected C# delegate representation.",
    ));
    return undefined;
  }
  const bindings = sourceParameters.map((parameterNode, index) => ({
    declaration: parameterNode,
    targetType: targetContext.signature.parameterTargetTypes[index]!,
  }));
  for (const binding of bindings) {
    const parameter = AsParameterDeclaration(binding.declaration);
    const authoredTarget = parameter?.Type === undefined
      ? undefined
      : input.types.resolveNode(parameter.Type, sourceFile);
    if (
      authoredTarget !== undefined &&
      !targetTypeRefEquals(authoredTarget, binding.targetType)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        binding.declaration,
        "The authored source lambda parameter type conflicts with its exact selected C# delegate parameter representation.",
      ));
      return undefined;
    }
  }
  const scoped = createCsharpScopedTranslationContext(input, bindings);
  if (scoped.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      bindings[0]!.declaration,
      scoped.reason,
    ));
    return undefined;
  }
  return scoped.context;
}

export function isAsyncExpression(ast: AstReader, node: Node): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}

function getContextualTargetRef(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): TargetTypeRef | undefined {
  return input.types.resolveType(
    input.semantics(sourceFile).getContextualType(node),
    sourceFile,
  );
}

function getAsyncLambdaReturnExpressionSubject(node: Node, input: CsharpTranslationContext): Node | undefined {
  const expression = AsArrowFunction(node) ?? AsFunctionExpression(node);
  const typeArguments = csharpSourceTypeArgumentNodes(input.ast, expression?.Type);
  return typeArguments[0];
}
