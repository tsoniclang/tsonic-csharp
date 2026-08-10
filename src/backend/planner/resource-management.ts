import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpResourceManagement,
} from "../../policy/operations/index.js";
import type {
  CsharpResourceDisposalArm,
  CsharpResourceDisposalOperation,
} from "../../policy/operations/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../roslyn/syntax.js";
import {
  allocateResourceScopeNames,
  allocateSyntheticParameter,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  qualifiedCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  AsBlock,
  AsVariableStatement,
  KindVariableStatement,
  SourceKind,
} from "./source-ast.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

type BlockStatementPlanner = () => readonly CsharpStatement[];

export function planResourceManagedBlockStatements(
  blockNode: Node,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  const block = AsBlock(blockNode);
  const resources = directResourceDeclarations(
    block?.Statements?.Nodes ?? [],
    input,
  );
  if (resources.length === 0) {
    return planStatements();
  }
  return planResourceScopeStatements(
    resources[0]!,
    resourceScopeKind(resources, input),
    diagnostics,
    state,
    planStatements,
  );
}

export function planResourceManagedSourceFileStatements(
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  const resources = directResourceDeclarations(
    sourceFile.Statements?.Nodes ?? [],
    input,
  );
  return resources.length === 0
    ? planStatements()
    : planResourceScopeStatements(
        resources[0]!,
        resourceScopeKind(resources, input),
        diagnostics,
        state,
        planStatements,
      );
}

export function planResourceScopeStatements(
  diagnosticNode: Node,
  kind: "sync" | "async",
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  if (state.generator !== undefined) {
    diagnostics.push({
      code: "CSHARP_GENERATOR_RESOURCE_MANAGEMENT_NOT_PROVEN",
      category: "error",
      source: "tsonic-csharp",
      message:
        "Native C# iterator finally blocks cannot preserve SuppressedError composition when both generator execution and disposal fail.",
      sourceNode: diagnosticNode,
    });
    return [];
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
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement | undefined {
  const scope = state.resourceScope;
  if (scope === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "A resource declaration was planned outside its exact lexical resource scope.",
    ));
    return undefined;
  }
  const selected = selectCsharpResourceManagement(
    input,
    declaration,
    sourceFile,
  );
  if (selected.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(declaration, selected.reason));
    return undefined;
  }
  const operations = selected.registration.kind === "direct"
    ? [selected.registration.disposal]
    : selected.registration.arms.map((arm) => arm.disposal);
  if (
    scope.kind === "sync" &&
    operations.some((operation) => operation.kind !== "sync")
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "A synchronous resource scope cannot own an asynchronous disposer.",
    ));
    return undefined;
  }
  const resourceType = csharpTypeFromTargetTypeRef(
    selected.registration.resourceType,
  );
  if (resourceType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "The exact resource disposal receiver has no closed C# source representation.",
    ));
    return undefined;
  }
  const parameterName = allocateSyntheticParameter(state);
  const registrationName = resourceRegistrationName(selected.registration);
  const lambdaBody = selected.registration.kind === "direct"
    ? directDisposalBody(parameterName, selected.registration.disposal)
    : runtimeUnionDisposalBody(parameterName, selected.registration.arms);
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

type CsharpResolvedRegistration = Extract<
  ReturnType<typeof selectCsharpResourceManagement>,
  { readonly kind: "resolved" }
>["registration"];

function runtimeUnionDisposalBody(
  parameterName: string,
  arms: readonly CsharpResourceDisposalArm[],
): { readonly kind: "Block"; readonly statements: readonly CsharpStatement[] } {
  const asynchronous = arms.some((arm) => arm.disposal.kind !== "sync");
  return {
    kind: "Block",
    statements: arms.map((arm) => {
      const projected: CsharpExpression = {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: parameterName },
          name: `As${arm.armIndex + 1}`,
        },
        arguments: [],
      };
      const disposal = disposalInvocation(projected, arm.disposal);
      return {
        kind: "IfStatement",
        condition: {
          kind: "InvocationExpression",
          callee: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: parameterName },
            name: `Is${arm.armIndex + 1}`,
          },
          arguments: [],
        },
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

function directResourceDeclarations(
  statements: readonly (Node | undefined)[],
  input: CsharpTranslationContext,
): readonly Node[] {
  return statements.flatMap((statement) => {
    if (
      statement === undefined ||
      SourceKind(input.ast, statement) !== KindVariableStatement
    ) {
      return [];
    }
    const declarationList = AsVariableStatement(statement)?.DeclarationList;
    if (declarationList === undefined) {
      return [];
    }
    return input.ast.children(declarationList).filter(
      (declaration): declaration is Node =>
        declaration !== undefined &&
        input.ast.is.IsVariableDeclaration(declaration) &&
        (
          input.ast.variableDeclarationKind(declaration) === "using" ||
          input.ast.variableDeclarationKind(declaration) === "await using"
        ),
    );
  });
}

function resourceScopeKind(
  resources: readonly Node[],
  input: CsharpTranslationContext,
): "sync" | "async" {
  return resources.some((declaration) =>
      input.ast.variableDeclarationKind(declaration) === "await using"
    )
    ? "async"
    : "sync";
}
