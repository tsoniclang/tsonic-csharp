import type { CsharpPlanningContext } from "../context.js";
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
import type { CsharpBlock, CsharpExpression, CsharpLambdaParameter, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import {
  createDestructuringPlannerState,
  createNestedPlannerState,
  declareCsharpLocalBindingName,
  allocateSyntheticParameter,
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  getCsharpTypeForNode,
  nullableCsharpType,
} from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../declarations/modifiers.js";
import { planBlockStatements } from "../statements/index.js";
import { planCsharpCaptureFrame, planCsharpCaptureEntryBindings } from "../bindings/capture-storage.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type {
  CsharpDelegateSignatureShape,
} from "../../../target-model/types/index.js";
import type {
  ExpressionPlanner,
  ExpectedExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getCsharpTaskResultTargetType,
  csharpVoidReturnCompletion,
  isCsharpVoidTargetType,
  csharpVoidTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
  getCsharpCallableValueSignature,
} from "../../../target-model/types/index.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../target-model/syntax/type-arguments.js";
import {
  hasCsharpGeneratorSyntax,
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

export function planArrowFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
  planExpressionWithExpectedType?: ExpectedExpressionPlanner,
): CsharpPlannedValue | undefined {
  const creationPolicy = input.program.captureStorage.lambdaCreation(node);
  if (creationPolicy.kind === "discarded") return csharpPlannedEffect(csharpVoidTargetType(), []);
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  const closure = input.scope.nativeCallableBody === node ? undefined : input.program.captureStorage.closure(node);
  const complete = (expression: CsharpExpression | undefined): CsharpPlannedValue | undefined => {
    const carrier = closure?.method.type ?? targetContext?.carrier;
    if (expression?.kind !== "LambdaExpression" || input.scope.nativeCallableBody === node ||
      creationPolicy.kind === "inline") {
      return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression, carrier);
    }
    const body: CsharpBlock = expression.body.kind === "Block" ? expression.body : {
      kind: "Block", statements: targetContext?.signature.returnTargetType !== undefined &&
        isCsharpVoidTargetType(targetContext.signature.returnTargetType)
        ? [{ kind: "ExpressionStatement", expression: expression.body }]
        : [{ kind: "ReturnStatement", expression: expression.body }],
    };
    const creation = planCsharpLocalLambdaCreation(node, input, diagnostics, targetContext,
      input.names.temporaryName(`__tsonic_callable_${input.program.source.ast.pos(node)}`),
      expression.parameters, body, expression.async === true, creationPolicy);
    return creation === undefined ? undefined : planCsharpExpressionCompletion(
      node, sourceFile, input, diagnostics, creation.value, carrier, [creation.method]);
  };
  if (closure !== undefined) {
    return complete(planCsharpFrameClosureReference(node, input, diagnostics, state));
  }
  const expression = AsArrowFunction(input.program.source.ast, node)!;
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const returnContext = getLambdaReturnContext(node, targetContext, input, diagnostics);
  if (isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const scopedInput = createLambdaPlanningContext(
    expression.Parameters?.Nodes ?? [],
    input,
    diagnostics,
    targetContext,
  );
  if (scopedInput === undefined) {
    return undefined;
  }
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
    return complete({
      kind: "LambdaExpression",
      ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
      parameters,
      body,
    });
  }
  const entryPrelude = expression.Body === undefined ? parameterIdentityDeclarations : [
    ...planCsharpCaptureFrame(expression.Body, scopedInput, diagnostics, plannerState),
    ...parameterIdentityDeclarations,
    ...planCsharpCaptureEntryBindings(expression.Body, scopedInput, plannerState),
  ];
  const completion = expression.Body === undefined ? undefined : csharpVoidReturnCompletion(
    input.types.classifications.resolveNode(expression.Body, sourceFile), returnContext?.returnExpressionTargetType);
  const body = completion === undefined && returnContext !== undefined && planExpressionWithExpectedType !== undefined
    ? planExpressionWithExpectedType(
      expression.Body!,
      sourceFile,
      scopedInput,
      diagnostics,
      returnContext.returnExpressionType,
      returnContext.returnExpressionTypeSubject,
      returnContext.returnExpressionTargetType,
      plannerState,
    )
    : planExpression(expression.Body!, sourceFile, scopedInput, diagnostics, plannerState);
  if (body === undefined) {
    return undefined;
  }
  return complete({
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
    parameters,
    body: completion !== undefined
      ? { kind: "Block", statements: [...entryPrelude, ...planCsharpVoidReturn(body, completion,
        returnContext?.returnExpressionTargetType, input.scope.typeParameterNames)] }
      : entryPrelude.length === 0 && body.prelude.length === 0 && body.completion.kind === "value"
      ? body.completion.expression
      : {
          kind: "Block",
          statements: [
            ...entryPrelude,
            ...consumeCsharpPlannedValue(body, value => [
              targetContext?.signature.returnTargetType !== undefined &&
                  isCsharpVoidTargetType(targetContext.signature.returnTargetType)
                ? { kind: "ExpressionStatement", expression: value }
                : { kind: "ReturnStatement", expression: value },
            ], () => [{ kind: "ReturnStatement" }]),
          ],
        },
  });
}

export function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): CsharpPlannedValue | undefined {
  const creationPolicy = input.program.captureStorage.lambdaCreation(node);
  if (creationPolicy.kind === "discarded") return csharpPlannedEffect(csharpVoidTargetType(), []);
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  const closure = input.scope.nativeCallableBody === node ? undefined : input.program.captureStorage.closure(node);
  const complete = (expression: CsharpExpression | undefined, prelude: readonly CsharpStatement[] = []): CsharpPlannedValue | undefined =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression,
      closure?.method.type ?? targetContext?.carrier, prelude);
  if (closure !== undefined) {
    return complete(planCsharpFrameClosureReference(node, input, diagnostics, state));
  }
  const expression = AsFunctionExpression(input.program.source.ast, node)!;
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const generatorSyntax = hasCsharpGeneratorSyntax(node, input);
  const returnContext = generatorSyntax
    ? undefined
    : getLambdaReturnContext(node, targetContext, input, diagnostics);
  if (!generatorSyntax && isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) {
    return undefined;
  }
  const creationState = state ?? createDestructuringPlannerState(node, input.program.source.ast);
  const self = input.program.captureStorage.closure(node) === undefined ? input.program.captureStorage.namedSelf(node) : undefined;
  const captureContext = self === undefined ? undefined
    : planCsharpNamedSelfCaptureContext(self, input, diagnostics, creationState);
  if (self !== undefined && captureContext === undefined) return undefined;
  const plannerState = state === undefined ? creationState : createNestedPlannerState(state, node, input.program.source.ast);
  const scopedInput = createLambdaPlanningContext(
    expression.Parameters?.Nodes ?? [],
    captureContext?.context ?? input,
    diagnostics,
    targetContext,
  );
  if (scopedInput === undefined) {
    return undefined;
  }
  const parameterNodes = expression.Parameters?.Nodes ?? [];
  const methodName = self === undefined ? undefined : input.names.temporaryName(`__tsonic_self_${input.program.source.ast.pos(node)}`);
  const valueName = self === undefined || self.values.length === 0 ? undefined : input.names.temporaryName(`${methodName}Value`);
  if (self !== undefined) {
    for (const reference of self.calls) plannerState.expressionOverrides.set(reference, { kind: "IdentifierName", name: methodName! });
    for (const reference of self.values) plannerState.expressionOverrides.set(reference, { kind: "IdentifierName", name: valueName! });
  }
  const completeBody = (body: CsharpBlock, async = false): CsharpPlannedValue | undefined => {
    if (self === undefined && (input.scope.nativeCallableBody === node || creationPolicy.kind === "inline")) {
      return complete({ kind: "LambdaExpression", ...(async ? { async: true } : {}), parameters, body });
    }
    const creation = planCsharpLocalLambdaCreation(node, input, diagnostics, targetContext,
      methodName ?? input.names.temporaryName(`__tsonic_callable_${input.program.source.ast.pos(node)}`),
      parameters, body, async, creationPolicy);
    if (creation === undefined || targetContext === undefined) return undefined;
    const { method, value } = creation;
    return valueName === undefined ? complete(value, [...captureContext?.prelude ?? [], method]) : complete({ kind: "IdentifierName", name: valueName }, [
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
  if (generatorSyntax) {
    const generator = planCsharpGeneratorFunction(
      node,
      expression.Body,
      sourceFile,
      scopedInput,
      diagnostics,
      plannerState,
      parameterIdentityDeclarations,
      planBlockStatements,
    );
    if (generator === undefined) {
      return undefined;
    }
    return completeBody(generator.body);
  }
  const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, plannerState, targetContext, returnContext, parameterIdentityDeclarations);
  if (body === undefined) {
    return undefined;
  }
  return completeBody(body, isAsyncExpression(input.program.source.ast, node));
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
  returnContext: LambdaReturnContext | undefined = getLambdaReturnContext(lambdaNode, targetContext, input, diagnostics),
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
  const returnContract = input.program.declarations.returnContract(lambdaNode);
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
        ? [planCsharpAbsenceReturn(lambdaState.currentReturnExpressionTargetType, input.scope.typeParameterNames)] : [])] };
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
  diagnostics: TargetDiagnostic[],
): LambdaReturnContext | undefined {
  if (targetContext === undefined) {
    return undefined;
  }
  if (!isAsyncExpression(input.program.source.ast, node)) {
    const returnExpressionType = targetContext.signature.returnType;
    if (returnExpressionType === undefined) {
      return undefined;
    }
    const returnExpressionTypeSubject = getAuthoredLambdaReturnTypeNode(node, input.program.source.ast);
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
  const returnExpressionType = csharpTypeFromTargetTypeRef(resultTargetType, input.scope.typeParameterNames);
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

function getAuthoredLambdaReturnTypeNode(node: Node, ast: AstReader): Node | undefined {
  return (AsArrowFunction(ast, node) ?? AsFunctionExpression(ast, node))?.Type;
}

export function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  expectedContext?: LambdaTargetContext,
): readonly CsharpLambdaParameter[] {
  const expectedParameterTypes = expectedContext?.signature.parameters ?? [];
  const sourceParameters = parameterNodes
    .filter((parameterNode): parameterNode is Node => parameterNode !== undefined)
    .map((parameterNode, index): CsharpLambdaParameter => {
      const parameter = AsParameterDeclaration(input.program.source.ast, parameterNode)!;
      diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, parameterNode, "lambda parameter declaration", diagnostics);
      if (
        parameter.DotDotDotToken !== undefined &&
        expectedContext?.signature.restParameterIndex !== index
      ) {
        diagnostics.push(unsupportedNodeDiagnostic(
          parameterNode,
          "A lambda rest parameter requires exact selected delegate rest-parameter evidence before C# emission.",
        ));
      }
      const bindingPattern = HasSourceKind(input.program.source.ast, parameter.name, KindObjectBindingPattern) ||
        HasSourceKind(input.program.source.ast, parameter.name, KindArrayBindingPattern);
      if (!HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier) && !bindingPattern) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode, "Lambda parameter binding is outside the current C# planning surface."));
      }
      const expectedParameterType = expectedParameterTypes[index];
      const authoredParameterType = parameter.Type === undefined
        ? undefined
        : getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics);
      const sourceParameterType = authoredParameterType === undefined ||
          input.program.source.ast.questionToken(parameterNode) === undefined
        ? authoredParameterType
        : nullableCsharpType(authoredParameterType);
      const nativeParameterType = input.program.storage.lambdaParameterType(parameterNode);
      const explicitParameterType = nativeParameterType === undefined
        ? sourceParameterType
        : csharpTypeFromTargetTypeRef(nativeParameterType, input.scope.typeParameterNames);
      return {
        kind: "Parameter",
        name: bindingPattern
          ? allocateSyntheticParameter(state)
          : declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Lambda parameter", "arg"),
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
      name: allocateSyntheticParameter(state),
      type,
    }));
  return [...sourceParameters, ...omittedTargetParameters];
}

export function diagnoseMissingLambdaTargetContext(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  input: CsharpPlanningContext,
  expectedType?: CsharpTypeNode,
  expectedTargetType?: TargetTypeRef,
): LambdaTargetContext | undefined {
  if (!HasSourceKind(input.program.source.ast, node, KindArrowFunction) && !HasSourceKind(input.program.source.ast, node, KindFunctionExpression)) {
    return undefined;
  }
  void expectedType;
  const observedSelf = (input.program.captureStorage.namedSelf(node)?.values.length ?? 0) > 0;
  const nativeBody = input.scope.nativeCallableBody === node;
  return lambdaTargetContextFromTargetRef(
    input.scope.typeParameterNames,
    nativeBody ? expectedTargetType
      : observedSelf ? input.types.classifications.resolveNode(node, sourceFile)
      : input.program.expectedTypes.callableTarget(node) ?? expectedTargetType ?? input.types.classifications.resolveNode(node, sourceFile),
  );
}

export function csharpDelegateSignatureFromTargetTypeRef(
  type: TargetTypeRef | undefined,
): CsharpDelegateSignatureShape | undefined {
  const signature = getCsharpCallableValueSignature(type);
  return signature?.returnType === undefined ? undefined : signature;
}

export function lambdaTargetContextFromTargetRef(typeParameterNames: ReadonlyMap<string, string> | undefined, type: TargetTypeRef | undefined): LambdaTargetContext | undefined {
  const signature = csharpDelegateSignatureFromTargetTypeRef(type);
  if (signature === undefined || type === undefined) {
    return undefined;
  }
  const targetType = csharpTypeFromTargetTypeRef(type, typeParameterNames);
  if (targetType === undefined) {
    return undefined;
  }
  const parameters = signature.parameters.map(type => csharpTypeFromTargetTypeRef(type, typeParameterNames));
  const returnType = csharpTypeFromTargetTypeRef(signature.returnType, typeParameterNames);
  if (parameters.some((parameter) => parameter === undefined) || returnType === undefined) {
    return undefined;
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

function createLambdaPlanningContext(
  parameterNodes: readonly (Node | undefined)[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  targetContext: LambdaTargetContext | undefined,
): CsharpPlanningContext | undefined {
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
    const sealedTarget = input.program.storage.lambdaParameterType(binding.declaration);
    if (sealedTarget === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        binding.declaration,
        "C# analysis did not seal the exact selected delegate representation for this lambda parameter.",
      ));
      return undefined;
    }
    if (!targetTypeRefEquals(sealedTarget, binding.targetType)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        binding.declaration,
        `The sealed lambda parameter representation '${targetTypeRefKey(sealedTarget)}' conflicts with its exact selected C# delegate parameter representation '${targetTypeRefKey(binding.targetType)}'.`,
      ));
      return undefined;
    }
  }
  return input;
}

export function isAsyncExpression(ast: AstReader, node: Node): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}

function getAsyncLambdaReturnExpressionSubject(node: Node, input: CsharpPlanningContext): Node | undefined {
  const expression = AsArrowFunction(input.program.source.ast, node) ?? AsFunctionExpression(input.program.source.ast, node);
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, expression?.Type);
  return typeArguments[0];
}
