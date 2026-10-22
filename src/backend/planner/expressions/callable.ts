import type { CsharpPlanningContext } from "../context.js";
import {
  AsArrowFunction,
  AsFunctionExpression,
  AsParameterDeclaration,
  HasSourceKind,
  HasSyntacticModifier,
  KindBlock,
  KindObjectBindingPattern,
  KindArrayBindingPattern,
  ModifierFlagsAsync,
} from "@tsonic/target-api/source";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBlock, CsharpExpression, CsharpLambdaParameter, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import {
  createDestructuringPlannerState,
  createNestedPlannerState,
  declareCsharpLocalBindingName,
  allocateSyntheticParameter,
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planBlockStatements } from "../statements/index.js";
import { planCsharpCaptureFrame, planCsharpCaptureEntryBindings } from "../bindings/capture-storage.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import {
  csharpVoidTargetType,
} from "../../../target-model/types/index.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../target-model/syntax/type-arguments.js";
import {
  hasCsharpGeneratorPlan,
  planCsharpGeneratorFunction,
} from "../statements/generators.js";
import { planLambdaParameterStorage } from "./lambda-parameter-storage.js";
import { planCsharpFrameClosureReference, planCsharpNamedSelfCaptureContext } from "../bindings/capture-closures.js";
import { consumeCsharpPlannedValue, planCsharpVoidReturn, planCsharpAbsenceReturn } from "../statements/statement-output.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { csharpPlannedEffect } from "./planned-values.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { planCsharpLocalLambdaCreation } from "./lambda-creation.js";

export interface LambdaTargetContext {
  readonly carrier: TargetTypeRef;
  readonly type: CsharpTypeNode;
  readonly signature: {
    readonly parameters: readonly CsharpTypeNode[];
    readonly parameterTargetTypes: readonly TargetTypeRef[];
    readonly returnType?: CsharpTypeNode;
    readonly returnTargetType?: TargetTypeRef;
    readonly restParameterIndex?: number;
  };
}

export function planArrowFunctionExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState
): CsharpPlannedValue | undefined {
  const creationPolicy = input.program.records.lambdaCreation.get(node);
  if (creationPolicy.kind === "discarded") return csharpPlannedEffect(csharpVoidTargetType(), []);
  const targetContext = getLambdaTargetContext(node, input);
  const closure = input.scope.nativeCallableBody?.declaration === node ? undefined : input.program.records.captureClosure.get(node);
  const complete = (expression: Extract<CsharpExpression, { readonly kind: "LambdaExpression" }> | undefined): CsharpPlannedValue | undefined => {
    if (expression === undefined) return undefined;
    const carrier = closure?.method.type ?? targetContext?.carrier;
    if (creationPolicy.kind === "quotation") {
      if (expression.async === true || expression.body.kind === "Block") failCsharpPlannerInvariant("An admitted native quotation requires its expression-only synchronous body.", node);
      return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression, targetContext?.carrier);
    }
    if (input.scope.nativeCallableBody?.declaration === node ||
      creationPolicy.kind === "inline") {
      const planned = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression, carrier);
      return planned === undefined ? undefined : { ...planned, callable: { kind: "lambda", expression } };
    }
    const body: CsharpBlock = expression.body.kind === "Block" ? expression.body : {
      kind: "Block", statements: targetContext?.signature.returnTargetType !== undefined &&
        input.program.records.typeEmission.get(targetContext.signature.returnTargetType)?.completion === "void"
        ? [{ kind: "ExpressionStatement", expression: expression.body }]
        : [{ kind: "ReturnStatement", expression: expression.body }],
    };
    const creation = planCsharpLocalLambdaCreation(node, input, diagnostics, targetContext,
      input.names.temporaryName(`__tsonic_callable_${input.program.source.ast.pos(node)}`),
      expression.parameters, body, expression.async === true, creationPolicy);
    if (creation === undefined) return undefined;
    const planned = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, creation.value, carrier, [creation.method]);
    return planned === undefined || creationPolicy.kind !== "direct" ? planned : { ...planned, callable: { kind: "method" } };
  };
  if (closure !== undefined) {
    const reference = planCsharpFrameClosureReference(node, input, diagnostics, state);
    const planned = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, reference?.expression, closure.method.type);
    return planned === undefined ? undefined : { ...planned, callable: reference?.callable };
  }
  return complete(planCsharpArrowLambdaSyntax(node, sourceFile, input, diagnostics, planExpression, state));
}

export function planCsharpArrowLambdaSyntax(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state?: DestructuringPlannerState,
): Extract<CsharpExpression, { readonly kind: "LambdaExpression" }> | undefined {
  const creationPolicy = input.program.records.lambdaCreation.get(node);
  const targetContext = getLambdaTargetContext(node, input);
  const expression = AsArrowFunction(input.program.source.ast, node)!;
  const returnContext = getLambdaReturnContext(node, targetContext, input);
  if (isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const scopedInput = input;
  const parameterNodes = expression.Parameters?.Nodes ?? [];
  const plannerState = state === undefined
    ? createDestructuringPlannerState(node, input.program.source.ast)
    : createNestedPlannerState(state, node, input.program.source.ast);
  const sourceParameters = planLambdaParameters(
    parameterNodes,
    sourceFile,
    scopedInput,
    diagnostics,
    plannerState,
    targetContext,
  );
  const parameterPlan = planLambdaParameterStorage(
    parameterNodes, sourceParameters, sourceFile, scopedInput, diagnostics, plannerState,
  );
  if (parameterPlan === undefined) return undefined;
  const parameters = parameterPlan.parameters;
  const parameterIdentityDeclarations = parameterPlan.prelude;
  if (HasSourceKind(input.program.source.ast, expression.Body, KindBlock)) {
    const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, plannerState, targetContext, returnContext, parameterIdentityDeclarations);
    if (body === undefined) {
      return undefined;
    }
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
      parameters,
      body,
    };
  }
  const entryPrelude = expression.Body === undefined ? parameterIdentityDeclarations : [
    ...planCsharpCaptureFrame(expression.Body, scopedInput, diagnostics, plannerState),
    ...parameterIdentityDeclarations,
    ...planCsharpCaptureEntryBindings(expression.Body, scopedInput, plannerState),
  ];
  const completion = input.program.records.lambdaBody.get(node)?.completion;
  const body = planExpression(expression.Body!, sourceFile, scopedInput, diagnostics, plannerState);
  if (body === undefined) {
    return undefined;
  }
  const quotedEffect = creationPolicy.kind === "quotation" && completion === "void" &&
    entryPrelude.length === 0 && body.completion.kind === "void" && body.prelude.length === 1 &&
    body.effect !== undefined ? body.effect : undefined;
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
    parameters,
    body: quotedEffect ?? (completion !== undefined
      ? { kind: "Block", statements: [...entryPrelude, ...planCsharpVoidReturn(body, completion,
        returnContext?.returnExpressionTargetType, input)] }
      : entryPrelude.length === 0 && body.prelude.length === 0 && body.completion.kind === "value"
      ? body.completion.expression
      : {
          kind: "Block",
          statements: [
            ...entryPrelude,
            ...consumeCsharpPlannedValue(body, value => [
              targetContext?.signature.returnTargetType !== undefined &&
                  input.program.records.typeEmission.get(targetContext.signature.returnTargetType)?.completion === "void"
                ? { kind: "ExpressionStatement", expression: value }
                : { kind: "ReturnStatement", expression: value },
            ], () => [{ kind: "ReturnStatement" }]),
          ],
        }),
  };
}

export function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const creationPolicy = input.program.records.lambdaCreation.get(node);
  if (creationPolicy.kind === "discarded") return csharpPlannedEffect(csharpVoidTargetType(), []);
  if (creationPolicy.kind === "quotation") {
    return failCsharpPlannerInvariant("An admitted native quotation cannot be a function-expression statement body.", node);
  }
  const targetContext = getLambdaTargetContext(node, input);
  const closure = input.scope.nativeCallableBody?.declaration === node ? undefined : input.program.records.captureClosure.get(node);
  const complete = (expression: CsharpExpression | undefined, prelude: readonly CsharpStatement[] = []): CsharpPlannedValue | undefined =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression,
      closure?.method.type ?? targetContext?.carrier, prelude);
  if (closure !== undefined) {
    const reference = planCsharpFrameClosureReference(node, input, diagnostics, state);
    const planned = complete(reference?.expression);
    return planned === undefined ? undefined : { ...planned, callable: reference?.callable };
  }
  const expression = AsFunctionExpression(input.program.source.ast, node)!;
  const generatorSyntax = hasCsharpGeneratorPlan(node, input);
  const returnContext = generatorSyntax
    ? undefined
    : getLambdaReturnContext(node, targetContext, input);
  if (!generatorSyntax && isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const creationState = state ?? createDestructuringPlannerState(node, input.program.source.ast);
  const self = input.program.records.captureClosure.get(node) === undefined ? input.program.records.namedSelf.get(node) : undefined;
  const captureContext = self === undefined ? undefined
    : planCsharpNamedSelfCaptureContext(self, input, diagnostics, creationState);
  if (self !== undefined && captureContext === undefined) return undefined;
  const plannerState = state === undefined ? creationState : createNestedPlannerState(state, node, input.program.source.ast);
  const scopedInput = captureContext?.context ?? input;
  const parameterNodes = expression.Parameters?.Nodes ?? [];
  const methodName = self === undefined ? undefined : input.names.temporaryName(`__tsonic_self_${input.program.source.ast.pos(node)}`);
  const valueName = self === undefined || self.values.length === 0 ? undefined : input.names.temporaryName(`${methodName}Value`);
  if (self !== undefined) {
    for (const reference of self.calls) plannerState.expressionOverrides.set(reference, { kind: "IdentifierName", name: methodName! });
    for (const reference of self.values) plannerState.expressionOverrides.set(reference, { kind: "IdentifierName", name: valueName! });
  }
  const completeBody = (body: CsharpBlock, async = false): CsharpPlannedValue | undefined => {
    if (self === undefined && (input.scope.nativeCallableBody?.declaration === node || creationPolicy.kind === "inline")) {
      const expression = { kind: "LambdaExpression" as const, ...(async ? { async: true } : {}), parameters, body };
      const planned = complete(expression);
      return planned === undefined ? undefined : { ...planned, callable: { kind: "lambda", expression } };
    }
    const creation = planCsharpLocalLambdaCreation(node, input, diagnostics, targetContext,
      methodName ?? input.names.temporaryName(`__tsonic_callable_${input.program.source.ast.pos(node)}`),
      parameters, body, async, creationPolicy);
    if (creation === undefined || targetContext === undefined) return undefined;
    const { method, value } = creation;
    if (valueName === undefined) {
      const planned = complete(value, [...captureContext?.prelude ?? [], method]);
      return planned === undefined || creationPolicy.kind !== "direct" ? planned : { ...planned, callable: { kind: "method" } };
    }
    return complete({ kind: "IdentifierName", name: valueName }, [
      ...captureContext?.prelude ?? [],
      { kind: "LocalDeclarationStatement", name: valueName, type: targetContext.type,
        initializer: { kind: "DefaultExpression", type: targetContext.type, nullForgiving: true } }, method,
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: { kind: "IdentifierName", name: valueName },
        operatorToken: { kind: "EqualsToken" }, right: value } },
    ]);
  };
  const sourceParameters = planLambdaParameters(
    parameterNodes,
    sourceFile,
    scopedInput,
    diagnostics,
    plannerState,
    targetContext,
  );
  const parameterPlan = planLambdaParameterStorage(
    parameterNodes, sourceParameters, sourceFile, scopedInput, diagnostics, plannerState,
  );
  if (parameterPlan === undefined) return undefined;
  const parameters = parameterPlan.parameters;
  const parameterIdentityDeclarations = parameterPlan.prelude;
  const body = planCsharpFunctionLambdaBody(node, expression.Body, sourceFile, scopedInput, diagnostics,
    plannerState, targetContext, returnContext, parameterIdentityDeclarations, generatorSyntax);
  return body === undefined ? undefined : completeBody(body, !generatorSyntax && isAsyncExpression(input.program.source.ast, node));
}

function planCsharpFunctionLambdaBody(
  node: Node, bodyNode: Node | undefined, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
  targetContext: LambdaTargetContext | undefined, returnContext: LambdaReturnContext | undefined,
  entryPrelude: readonly CsharpStatement[], generator: boolean,
): CsharpBlock | undefined {
  if (generator) {
    const planned = planCsharpGeneratorFunction(node, bodyNode, sourceFile, input, diagnostics, state, entryPrelude, planBlockStatements);
    return planned?.body;
  }
  return planLambdaBlockBody(node, bodyNode, sourceFile, input, diagnostics, state, targetContext, returnContext, entryPrelude);
}

export function planCsharpCapturedFunctionLambdaSyntax(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  parentState?: DestructuringPlannerState,
): Extract<CsharpExpression, { readonly kind: "LambdaExpression" }> | undefined {
  const expression = AsFunctionExpression(input.program.source.ast, node);
  if (expression === undefined) return undefined;
  const targetContext = getLambdaTargetContext(node, input);
  const generator = hasCsharpGeneratorPlan(node, input);
  const returnContext = generator ? undefined : getLambdaReturnContext(node, targetContext, input);
  if (!generator && isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) return undefined;
  const parameterNodes = expression.Parameters?.Nodes ?? [];
  const scoped = input;
  const state = parentState ?? createDestructuringPlannerState(node, input.program.source.ast);
  const parameterPlan = planLambdaParameterStorage(parameterNodes,
    planLambdaParameters(parameterNodes, sourceFile, scoped, diagnostics, state, targetContext),
    sourceFile, scoped, diagnostics, state);
  if (parameterPlan === undefined) return undefined;
  const body = planCsharpFunctionLambdaBody(node, expression.Body, sourceFile, scoped, diagnostics,
    state, targetContext, returnContext, parameterPlan.prelude, generator);
  return body === undefined ? undefined : { kind: "LambdaExpression", parameters: parameterPlan.parameters, body,
    ...(!generator && isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}) };
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  targetContext: LambdaTargetContext | undefined,
  returnContext: LambdaReturnContext | undefined = getLambdaReturnContext(lambdaNode, targetContext, input),
  entryPrelude: readonly CsharpStatement[] = [],
): CsharpBlock | undefined {
  if (isAsyncExpression(input.program.source.ast, lambdaNode) && returnContext === undefined) {
    return undefined;
  }
  const lambdaState = state ?? createDestructuringPlannerState(lambdaNode, input.program.source.ast);
  const previousReturnExpressionType = lambdaState.currentReturnExpressionType;
  const previousReturnExpressionTypeSubject = lambdaState.currentReturnExpressionTypeSubject;
  const previousReturnExpressionTargetType = lambdaState.currentReturnExpressionTargetType;
  const previousUndefinedReturn = lambdaState.currentUndefinedReturn;
  const returnContract = input.program.records.returnContract.get(lambdaNode);
  lambdaState.currentUndefinedReturn = returnContract?.kind === "resolved" && returnContract.undefinedReturn === true;
  if (returnContext !== undefined) {
    lambdaState.currentReturnExpressionType = returnContext.returnExpressionType;
    lambdaState.currentReturnExpressionTypeSubject = returnContext.returnExpressionTypeSubject;
    lambdaState.currentReturnExpressionTargetType = returnContext.returnExpressionTargetType;
  }
  try {
    const statements = planBlockStatements(bodyNode, sourceFile, input, diagnostics, lambdaState, entryPrelude);
    return { kind: "Block", statements: [...statements,
      ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
        ? [planCsharpAbsenceReturn(lambdaState.currentReturnExpressionTargetType, input)] : [])] };
  } finally {
    lambdaState.currentReturnExpressionType = previousReturnExpressionType;
    lambdaState.currentReturnExpressionTypeSubject = previousReturnExpressionTypeSubject;
    lambdaState.currentReturnExpressionTargetType = previousReturnExpressionTargetType;
    lambdaState.currentUndefinedReturn = previousUndefinedReturn;
  }
}

function getLambdaReturnContext(
  node: Node,
  targetContext: LambdaTargetContext | undefined,
  input: CsharpPlanningContext,
): LambdaReturnContext | undefined {
  if (targetContext === undefined) {
    return undefined;
  }
  if (!isAsyncExpression(input.program.source.ast, node)) {
    const returnExpressionType = targetContext.signature.returnType;
    if (returnExpressionType === undefined) {
      return failCsharpPlannerInvariant("An admitted lambda body requires its rendered native return type.", node);
    }
    const returnExpressionTypeSubject = getAuthoredLambdaReturnTypeNode(node, input.program.source.ast);
    const returnExpressionTargetType = input.program.records.returnContext.get(node)?.target;
    return {
      returnExpressionType,
      ...(returnExpressionTypeSubject === undefined ? {} : { returnExpressionTypeSubject }),
      ...(returnExpressionTargetType === undefined ? {} : { returnExpressionTargetType }),
    };
  }
  const returnTargetType = targetContext.signature.returnTargetType;
  const resultTargetType = returnTargetType === undefined ? undefined : input.program.records.typeEmission.get(returnTargetType)?.taskResult;
  if (resultTargetType === undefined) {
    return failCsharpPlannerInvariant("An admitted asynchronous lambda requires its exact native task-result carrier.", node);
  }
  const returnExpressionType = csharpTypeFromTargetTypeRef(resultTargetType, input.scope.typeParameterNames);
  if (returnExpressionType === undefined) {
    return failCsharpPlannerInvariant("An admitted asynchronous lambda requires its rendered native task-result carrier.", node);
  }
  const returnExpressionTypeSubject = getAsyncLambdaReturnExpressionSubject(node, input);
  const returnExpressionTargetType = input.program.records.returnContext.get(node)?.target;
  return {
    returnExpressionType,
    ...(returnExpressionTypeSubject === undefined ? {} : { returnExpressionTypeSubject }),
    ...(returnExpressionTargetType === undefined ? {} : { returnExpressionTargetType }),
  };
}

function getAuthoredLambdaReturnTypeNode(node: Node, ast: AstReader): Node | undefined {
  return (AsArrowFunction(ast, node) ?? AsFunctionExpression(ast, node))?.Type;
}

export function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  expectedContext: LambdaTargetContext,
): readonly CsharpLambdaParameter[] {
  const expectedParameterTypes = expectedContext.signature.parameters;
  const sourceParameters = parameterNodes
    .map((parameterNode, index): CsharpLambdaParameter => {
      if (parameterNode === undefined) failCsharpPlannerInvariant("An admitted lambda requires its complete native parameter vector.");
      const parameter = AsParameterDeclaration(input.program.source.ast, parameterNode)!;
      const bindingPattern = HasSourceKind(input.program.source.ast, parameter.name, KindObjectBindingPattern) ||
        HasSourceKind(input.program.source.ast, parameter.name, KindArrayBindingPattern);
      const expectedParameterType = expectedParameterTypes[index];
      if (expectedParameterType === undefined) failCsharpPlannerInvariant("An admitted lambda parameter requires its exact native signature type.", parameterNode);
      return {
        kind: "Parameter",
        name: bindingPattern
          ? allocateSyntheticParameter(state)
          : declareCsharpLocalBindingName(parameter.name!, input, state),
        type: expectedParameterType,
      };
    });
  const omittedTargetParameters = expectedParameterTypes
    .slice(sourceParameters.length)
    .map((type): CsharpLambdaParameter => ({
      kind: "Parameter",
      name: allocateSyntheticParameter(state),
      type,
    }));
  return [...sourceParameters, ...omittedTargetParameters];
}

export function getLambdaTargetContext(
  node: Node,
  input: CsharpPlanningContext,
): LambdaTargetContext {
  const nativeBody = input.scope.nativeCallableBody;
  const type = nativeBody?.declaration === node ? nativeBody.carrier : input.program.records.callableTarget.get(node);
  const signature = type === undefined ? undefined : input.program.records.typeEmission.get(type)?.lambda;
  if (signature === undefined || type === undefined) {
    return failCsharpPlannerInvariant("An admitted lambda requires its sealed native delegate signature.", node);
  }
  const typeParameterNames = input.scope.typeParameterNames;
  const targetType = csharpTypeFromTargetTypeRef(type, typeParameterNames);
  if (targetType === undefined) {
    return failCsharpPlannerInvariant("An admitted lambda requires its rendered native delegate type.", node);
  }
  const parameters = signature.parameters.map(type => csharpTypeFromTargetTypeRef(type, typeParameterNames));
  const returnType = csharpTypeFromTargetTypeRef(signature.returnType, typeParameterNames);
  if (parameters.some((parameter) => parameter === undefined) || returnType === undefined) {
    return failCsharpPlannerInvariant("An admitted lambda requires its rendered native parameter and return types.", node);
  }
  return {
    carrier: type,
    type: targetType,
    signature: {
      parameters: parameters as readonly CsharpTypeNode[],
      parameterTargetTypes: signature.parameters,
      returnType,
      returnTargetType: signature.returnType,
      ...(signature.restParameterIndex === undefined
        ? {}
        : { restParameterIndex: signature.restParameterIndex }),
    },
  };
}

export function isAsyncExpression(ast: AstReader, node: Node): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}

function getAsyncLambdaReturnExpressionSubject(node: Node, input: CsharpPlanningContext): Node | undefined {
  const expression = AsArrowFunction(input.program.source.ast, node) ?? AsFunctionExpression(input.program.source.ast, node);
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, expression?.Type);
  return typeArguments[0];
}
