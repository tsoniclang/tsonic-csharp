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
  Node_Text,
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
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  getCsharpTypeForNode,
  nullableCsharpType,
} from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../declarations/modifiers.js";
import { planBlockStatements } from "../statements/index.js";
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
  isCsharpVoidTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../target-model/syntax/type-arguments.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";
import {
  hasCsharpGeneratorSyntax,
  planCsharpGeneratorFunction,
} from "../statements/generators.js";

export interface LambdaTargetContext {
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
): CsharpExpression | undefined {
  const expression = AsArrowFunction(input.program.source.ast, node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
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
  const parameters = planLambdaParameters(
    parameterNodes,
    sourceFile,
    scopedInput,
    diagnostics,
    plannerState,
    targetContext,
  );
  const parameterIdentityDeclarations = planLambdaParameterIdentityDeclarations(
    parameterNodes,
    input,
    plannerState,
  );
  if (HasSourceKind(input.program.source.ast, expression.Body, KindBlock)) {
    const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, plannerState, targetContext, returnContext);
    if (body === undefined) {
      return undefined;
    }
    return {
      kind: "LambdaExpression",
      ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
      parameters,
      body: prependLambdaStatements(body, parameterIdentityDeclarations),
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
      plannerState,
    )
    : planExpression(expression.Body!, sourceFile, scopedInput, diagnostics, plannerState);
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
    parameters,
    body: parameterIdentityDeclarations.length === 0
      ? body
      : {
          kind: "Block",
          statements: [
            ...parameterIdentityDeclarations,
            targetContext?.signature.returnTargetType !== undefined &&
                isCsharpVoidTargetType(targetContext.signature.returnTargetType)
              ? { kind: "ExpressionStatement", expression: body }
              : { kind: "ReturnStatement", expression: body },
          ],
        },
  };
}

export function planFunctionExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expression = AsFunctionExpression(input.program.source.ast, node)!;
  const targetContext = getLambdaTargetContext(node, sourceFile, input, expectedType, expectedTargetType);
  diagnoseMissingLambdaTargetContext(node, sourceFile, input, diagnostics, targetContext);
  const generatorSyntax = hasCsharpGeneratorSyntax(node, input);
  const returnContext = generatorSyntax
    ? undefined
    : getLambdaReturnContext(node, targetContext, input, diagnostics);
  if (!generatorSyntax && isAsyncExpression(input.program.source.ast, node) && returnContext === undefined) {
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
  const parameters = planLambdaParameters(
    parameterNodes,
    sourceFile,
    scopedInput,
    diagnostics,
    plannerState,
    targetContext,
  );
  const parameterIdentityDeclarations = planLambdaParameterIdentityDeclarations(
    parameterNodes,
    input,
    plannerState,
  );
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
    return {
      kind: "LambdaExpression",
      parameters,
      body: generator.body,
    };
  }
  const body = planLambdaBlockBody(node, expression.Body, sourceFile, scopedInput, diagnostics, plannerState, targetContext, returnContext);
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    ...(isAsyncExpression(input.program.source.ast, node) ? { async: true } : {}),
    parameters,
    body: prependLambdaStatements(body, parameterIdentityDeclarations),
  };
}

function planLambdaParameterIdentityDeclarations(
  parameterNodes: readonly (Node | undefined)[],
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  return parameterNodes.flatMap((parameter) => {
    if (parameter === undefined) {
      return [];
    }
    const identity = planCsharpTypedLocationIdentityDeclaration(
      parameter,
      input,
      state,
    );
    return identity === undefined ? [] : [identity];
  });
}

function prependLambdaStatements(
  body: CsharpBlock,
  statements: readonly CsharpStatement[],
): CsharpBlock {
  return statements.length === 0
    ? body
    : {
        ...body,
        statements: [...statements, ...body.statements],
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  targetContext: LambdaTargetContext | undefined,
  returnContext: LambdaReturnContext | undefined = getLambdaReturnContext(lambdaNode, targetContext, input, diagnostics),
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
    const statements = planBlockStatements(bodyNode, sourceFile, input, diagnostics, lambdaState);
    return { kind: "Block", statements: [...statements,
      ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
        ? [{ kind: "ReturnStatement" as const, expression: { kind: "LiteralExpression" as const, value: null } }] : [])] };
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

function getAuthoredLambdaReturnTypeNode(node: Node, ast: AstReader): Node | undefined {
  return (AsArrowFunction(ast, node) ?? AsFunctionExpression(ast, node))?.Type;
}

export function planLambdaParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
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
      if (!HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier)) {
        diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode, "Lambda parameter binding is outside the current C# planning surface."));
      }
      const expectedParameterType = expectedParameterTypes[index];
      const authoredParameterType = parameter.Type === undefined
        ? undefined
        : getCsharpTypeForNode(parameter.Type, sourceFile, input, undefined, diagnostics);
      const explicitParameterType = authoredParameterType === undefined ||
          input.program.source.ast.questionToken(parameterNode) === undefined
        ? authoredParameterType
        : nullableCsharpType(authoredParameterType);
      return {
        kind: "Parameter",
        name: HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier) && state !== undefined
          ? declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Lambda parameter", "arg")
          : HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier)
            ? requireCsharpIdentifier(Node_Text(input.program.source.ast, parameter.name), diagnostics, "Lambda parameter")
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
  const expectedTargetContext = lambdaTargetContextFromTargetRef(expectedTargetType);
  if (expectedTargetContext !== undefined) {
    return expectedTargetContext;
  }
  void sourceFile;
  void expectedType;
  return lambdaTargetContextFromTargetRef(
    input.program.expectedTypes.callableTarget(node),
  );
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
    const sealedTarget = input.program.storage.requiredType(binding.declaration);
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
