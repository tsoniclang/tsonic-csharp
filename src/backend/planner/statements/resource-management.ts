import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { CsharpResourceDisposalArm, CsharpResourceDisposalOperation, CsharpResolvedResourceManagement } from "../../../target-model/records/storage/management.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import {
  allocateResourceScopeNames,
  allocateSyntheticParameter,
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  qualifiedCsharpType,
} from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../expressions/union-access.js";

type BlockStatementPlanner = () => readonly CsharpStatement[];

export function planResourceManagedBlockStatements(
  blockNode: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  const scope = input.program.records.resourceScope.get(blockNode);
  if (scope === undefined) {
    return planStatements();
  }
  return planResourceScopeStatements(
    scope.declarations[0]!,
    scope.kind,
    state,
    planStatements,
  );
}

export function planResourceManagedSourceFileStatements(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  const scope = input.program.records.resourceScope.get(sourceFile);
  return scope === undefined
    ? planStatements()
    : planResourceScopeStatements(
        scope.declarations[0]!,
        scope.kind,
        state,
        planStatements,
      );
}

export function planResourceScopeStatements(
  diagnosticNode: Node,
  kind: "sync" | "async",
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  if (state.generator !== undefined) {
    return failCsharpPlannerInvariant("A refused generator resource scope cannot reach native resource planning.", diagnosticNode);
  }
  const names = allocateResourceScopeNames(state);
  const previousScope = state.resourceScope;
  state.resourceScope = Object.freeze({ stackName: names.stackName, kind });
  let body: readonly CsharpStatement[];
  try {
    body = planStatements();
  } finally {
    state.resourceScope = previousScope;
  }
  const exceptionType = qualifiedCsharpType("System", "Exception");
  const stackType = qualifiedCsharpType(
    "Tsonic.CSharp.Runtime",
    kind === "sync" ? "ResourceStack" : "AsyncResourceStack",
  );
  const closeInvocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: names.stackName },
      name: kind === "sync"
        ? "DisposeAndThrow"
        : "DisposeAndThrowAsync",
    },
    arguments: [{
      kind: "Argument",
      expression: { kind: "IdentifierName", name: names.errorName },
    }],
  };
  return [
    {
      kind: "LocalDeclarationStatement",
      name: names.stackName,
      type: stackType,
      initializer: { kind: "ObjectCreationExpression", type: stackType },
    },
    {
      kind: "LocalDeclarationStatement",
      name: names.errorName,
      type: { kind: "NullableType", inner: exceptionType },
      initializer: { kind: "LiteralExpression", value: null },
    },
    {
      kind: "TryStatement",
      tryBody: { kind: "Block", statements: body },
      catchClause: {
        kind: "CatchClause",
        variableName: names.caughtErrorName,
        variableType: exceptionType,
        body: {
          kind: "Block",
          statements: [{
            kind: "ExpressionStatement",
            expression: {
              kind: "AssignmentExpression",
              left: { kind: "IdentifierName", name: names.errorName },
              operatorToken: { kind: "EqualsToken" },
              right: {
                kind: "IdentifierName",
                name: names.caughtErrorName,
              },
            },
          }],
        },
      },
      finallyBody: {
        kind: "Block",
        statements: [{
          kind: "ExpressionStatement",
          expression: kind === "sync"
            ? closeInvocation
            : { kind: "AwaitExpression", expression: closeInvocation },
        }],
      },
    },
  ];
}

export function planResourceRegistrationStatement(
  declaration: Node,
  local: CsharpLocalDeclaration,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpStatement {
  const scope = state.resourceScope;
  if (scope === undefined) {
    return failCsharpPlannerInvariant("A resource declaration was planned outside its exact lexical resource scope.", declaration);
  }
  const selected = input.program.records.resource.get(declaration);
  if (selected === undefined) {
    return failCsharpPlannerInvariant("An admitted resource declaration lost its exact native disposal classification.", declaration);
  }
  if (selected.kind === "rejected") {
    return failCsharpPlannerInvariant("A refused resource declaration cannot reach native resource planning.", declaration);
  }
  const operations = selected.registration.kind === "direct"
    ? [selected.registration.disposal]
    : selected.registration.arms.map((arm) => arm.disposal);
  if (
    scope.kind === "sync" &&
    operations.some((operation) => operation.kind !== "sync")
  ) {
    return failCsharpPlannerInvariant("An admitted synchronous resource scope cannot contain an asynchronous disposer.", declaration);
  }
  const resourceType = csharpTypeFromTargetTypeRef(
    selected.registration.resourceType, input.scope.typeParameterNames,
  );
  if (resourceType === undefined) {
    return failCsharpPlannerInvariant("An admitted native resource lost its exact disposal receiver type syntax.", declaration);
  }
  const parameterName = allocateSyntheticParameter(state);
  const registrationName = resourceRegistrationName(selected.registration);
  const lambdaBody = selected.registration.kind === "direct"
    ? directDisposalBody(parameterName, selected.registration.disposal)
    : runtimeUnionDisposalBody(parameterName, selected.registration.resourceType, selected.registration.arms, input);
  const asynchronousLambda = operations.some((operation) =>
    operation.kind === "async");
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: scope.stackName },
        name: registrationName,
        typeArguments: [resourceType],
      },
      arguments: [
        {
          kind: "Argument",
          expression: { kind: "IdentifierName", name: local.name },
        },
        {
          kind: "Argument",
          expression: {
            kind: "LambdaExpression",
            ...(asynchronousLambda ? { async: true } : {}),
            parameters: [{
              kind: "Parameter",
              name: parameterName,
              type: resourceType,
            }],
            body: lambdaBody,
          },
        },
      ],
    },
  };
}

function resourceRegistrationName(
  registration: CsharpResolvedRegistration,
): "Add" | "AddAsync" {
  if (registration.kind === "runtime-union") {
    return registration.arms.some((arm) => arm.disposal.kind !== "sync")
      ? "AddAsync"
      : "Add";
  }
  return registration.disposal.kind === "sync"
    ? "Add"
    : "AddAsync";
}

type CsharpResolvedRegistration = CsharpResolvedResourceManagement["registration"];

function runtimeUnionDisposalBody(
  parameterName: string,
  resourceType: TargetTypeRef,
  arms: readonly CsharpResourceDisposalArm[],
  input: CsharpPlanningContext,
): { readonly kind: "Block"; readonly statements: readonly CsharpStatement[] } {
  const asynchronous = arms.some((arm) => arm.disposal.kind !== "sync");
  return {
    kind: "Block",
    statements: arms.map((arm) => {
      const receiver: CsharpExpression = { kind: "IdentifierName", name: parameterName };
      const projected = runtimeUnionArmProjection(receiver, arm.armIndex, resourceType, false, input);
      const disposal = disposalInvocation(projected, arm.disposal);
      return {
        kind: "IfStatement",
        condition: runtimeUnionArmTest(receiver, arm.armIndex, resourceType, input),
        thenBody: {
          kind: "Block",
          statements: [{
            kind: "ExpressionStatement",
            expression: asynchronous && arm.disposal.kind !== "sync"
              ? { kind: "AwaitExpression", expression: disposal }
              : disposal,
          }],
        },
      } satisfies CsharpStatement;
    }),
  };
}

function directDisposalBody(
  parameterName: string,
  disposal: CsharpResourceDisposalOperation,
): CsharpExpression {
  const invocation = disposalInvocation(
    { kind: "IdentifierName", name: parameterName },
    disposal,
  );
  return disposal.kind === "async"
    ? { kind: "AwaitExpression", expression: invocation }
    : invocation;
}

function disposalInvocation(
  receiver: CsharpExpression,
  disposal: CsharpResourceDisposalOperation,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: disposal.targetName,
    },
    arguments: [],
  };
}

