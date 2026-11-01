import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpResourceDisposalArm, CsharpResourceDisposalOperation } from "../../../target-model/records/storage/management.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpLocalDeclaration, CsharpStatement } from "../../target-ast/syntax/index.js";
import { allocateResourceScopeNames, allocateSyntheticParameter } from "../bindings/binding-state.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import { qualifiedCsharpType } from "../types/index.js";
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
  return scope === undefined ? planStatements()
    : planResourceScopeStatements(scope.declarations[0]!, scope.kind, state, planStatements);
}

export function planResourceManagedSourceFileStatements(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  const scope = input.program.records.resourceScope.get(sourceFile);
  return scope === undefined ? planStatements()
    : planResourceScopeStatements(scope.declarations[0]!, scope.kind, state, planStatements);
}

export function planResourceScopeStatements(
  diagnosticNode: Node,
  kind: "sync" | "async",
  state: DestructuringPlannerState,
  planStatements: BlockStatementPlanner,
): readonly CsharpStatement[] {
  if (state.generator !== undefined)
    failCsharpPlannerInvariant("A refused generator resource scope cannot reach native resource planning.", diagnosticNode);
  const scope = Object.freeze({ kind, continuations: new Map<CsharpStatement, CsharpStatement[]>() });
  const previousScope = state.resourceScope;
  state.resourceScope = scope;
  let body: readonly CsharpStatement[];
  try {
    body = planStatements();
  } finally {
    state.resourceScope = previousScope;
  }
  const statements = closeResourceContinuations(body, scope.continuations);
  if (scope.continuations.size !== 0)
    failCsharpPlannerInvariant("Every admitted resource acquisition requires its exact native lexical continuation.", diagnosticNode);
  return statements;
}

function closeResourceContinuations(
  statements: readonly CsharpStatement[],
  continuations: Map<CsharpStatement, CsharpStatement[]>,
): readonly CsharpStatement[] {
  const result: CsharpStatement[] = [];
  for (const [index, statement] of statements.entries()) {
    const tail = continuations.get(statement);
    if (tail !== undefined) {
      continuations.delete(statement);
      tail.push(...closeResourceContinuations(statements.slice(index + 1), continuations));
      result.push(statement);
      return result;
    }
    result.push(statement.kind === "Block"
      ? { ...statement, body: { kind: "Block", statements: closeResourceContinuations(statement.body.statements, continuations) } }
      : statement);
  }
  return result;
}

export function planResourceRegistrationStatement(
  declaration: Node,
  local: CsharpLocalDeclaration,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpStatement {
  const scope = state.resourceScope;
  if (scope === undefined)
    failCsharpPlannerInvariant("A resource declaration was planned outside its exact lexical resource scope.", declaration);
  const selected = input.program.records.resource.get(declaration);
  if (selected === undefined)
    failCsharpPlannerInvariant("An admitted resource declaration lost its exact native disposal classification.", declaration);
  if (selected.kind === "rejected")
    failCsharpPlannerInvariant("A refused resource declaration cannot reach native resource planning.", declaration);
  const operations = selected.registration.kind === "direct"
    ? [selected.registration.disposal] : selected.registration.arms.map(arm => arm.disposal);
  if (scope.kind === "sync" && operations.some(operation => operation.kind !== "sync"))
    failCsharpPlannerInvariant("An admitted synchronous resource scope cannot contain an asynchronous disposer.", declaration);
  const resourceType = csharpTypeFromTargetTypeRef(selected.registration.resourceType, input.scope.typeParameterNames);
  const emission = input.program.records.typeEmission.get(selected.registration.resourceType);
  if (resourceType === undefined || emission === undefined)
    failCsharpPlannerInvariant("An admitted native resource lost its exact disposal receiver type syntax.", declaration);
  const names = allocateResourceScopeNames(state);
  const guarded = !emission.valueType || local.type.kind === "NullableType";
  const bindReceiver = guarded && selected.registration.kind === "direct";
  const receiver: CsharpExpression = { kind: "IdentifierName",
    name: bindReceiver ? allocateSyntheticParameter(state) : local.name };
  const disposal = selected.registration.kind === "direct"
    ? [disposalStatement(receiver, selected.registration.disposal)]
    : runtimeUnionDisposalStatements(receiver, selected.registration.resourceType, selected.registration.arms, input);
  const dispose: readonly CsharpStatement[] = guarded
    ? [{ kind: "IfStatement", condition: bindReceiver ? {
        kind: "IsPatternExpression", expression: { kind: "IdentifierName", name: local.name },
        type: resourceType.kind === "NullableType" ? resourceType.inner : resourceType, designation: receiver.name,
      } : { kind: "NullPatternExpression", expression: receiver, negated: true },
      thenBody: { kind: "Block", statements: disposal } }]
    : disposal;
  const exceptionType = qualifiedCsharpType("System", "Exception");
  const completionError: CsharpExpression = { kind: "IdentifierName", name: names.errorName };
  const tail: CsharpStatement[] = [];
  const statement: CsharpStatement = { kind: "Block", body: { kind: "Block", statements: [
    { kind: "LocalDeclarationStatement", name: names.errorName,
      type: { kind: "NullableType", inner: exceptionType }, initializer: { kind: "LiteralExpression", value: null } },
    { kind: "TryStatement", tryBody: { kind: "Block", statements: tail },
      catchClause: { kind: "CatchClause", variableName: names.caughtErrorName, variableType: exceptionType,
        body: { kind: "Block", statements: [
          { kind: "ExpressionStatement", expression: {
            kind: "AssignmentExpression", left: completionError, operatorToken: { kind: "EqualsToken" },
            right: { kind: "IdentifierName", name: names.caughtErrorName },
          } },
          { kind: "ThrowStatement" },
        ] } },
      finallyBody: { kind: "Block", statements: [
        { kind: "TryStatement", tryBody: { kind: "Block", statements: dispose },
          catchClause: { kind: "CatchClause", variableName: names.disposalErrorName, variableType: exceptionType,
            body: { kind: "Block", statements: [
              { kind: "IfStatement", condition: { kind: "NullPatternExpression", expression: completionError, negated: true },
                thenBody: { kind: "Block", statements: [
                  { kind: "ThrowStatement", expression: {
                    kind: "ObjectCreationExpression", type: qualifiedCsharpType("Tsonic.CSharp.Runtime", "SuppressedError"),
                    arguments: [
                      { kind: "Argument", expression: { kind: "IdentifierName", name: names.disposalErrorName } },
                      { kind: "Argument", expression: completionError },
                    ],
                  } },
                ] } },
              { kind: "ThrowStatement" },
            ] } },
        },
      ] },
    },
  ] } };
  scope.continuations.set(statement, tail);
  return statement;
}

function runtimeUnionDisposalStatements(
  receiver: CsharpExpression,
  resourceType: TargetTypeRef,
  arms: readonly CsharpResourceDisposalArm[],
  input: CsharpPlanningContext,
): readonly CsharpStatement[] {
  return arms.map(arm => ({
    kind: "IfStatement",
    condition: runtimeUnionArmTest(receiver, arm.armIndex, resourceType, input),
    thenBody: { kind: "Block", statements: [
      disposalStatement(runtimeUnionArmProjection(receiver, arm.armIndex, resourceType, false, input), arm.disposal),
    ] },
  }));
}

function disposalStatement(
  receiver: CsharpExpression,
  disposal: CsharpResourceDisposalOperation,
): CsharpStatement {
  const invocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver, name: disposal.targetName },
    arguments: [],
  };
  return { kind: "ExpressionStatement", expression: disposal.kind === "async"
    ? { kind: "AwaitExpression", expression: invocation } : invocation };
}

