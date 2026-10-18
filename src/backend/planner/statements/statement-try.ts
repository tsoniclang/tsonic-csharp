import type { CsharpPlanningContext } from "../context.js";
import {
  AsCatchClause,
  AsTryStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpCatchClause,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import {
  allocateCatchValue,
  declareCsharpLocalBindingName,
} from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  csharpCatchExceptionType,
  csharpThrownValueToValueExpression,
} from "../expressions/exception-flow.js";
import {
  isCsharpJsValueTargetType,
} from "../../../target-model/types/index.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";

export type BlockStatementPlanner = (
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBlockStatements: BlockStatementPlanner,
): CsharpStatement {
  const statement = AsTryStatement(input.program.source.ast, node)!;
  return {
    kind: "TryStatement",
    tryBody: {
      kind: "Block",
      statements: planBlockStatements(statement.TryBlock, sourceFile, input, diagnostics, state),
    },
    ...(statement.CatchClause !== undefined
      ? { catchClause: planCatchClause(statement.CatchClause, sourceFile, input, diagnostics, state, planBlockStatements) }
      : {}),
    ...(statement.FinallyBlock !== undefined
      ? { finallyBody: { kind: "Block", statements: planBlockStatements(statement.FinallyBlock, sourceFile, input, diagnostics, state) } }
      : {}),
  };
}

function planCatchClause(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBlockStatements: BlockStatementPlanner,
): CsharpCatchClause {
  const clause = AsCatchClause(input.program.source.ast, node)!;
  if (clause.VariableDeclaration !== undefined) {
    const variable = AsVariableDeclaration(input.program.source.ast, clause.VariableDeclaration)!;
    const variableName = variable.name;
    if (variable.name === undefined) {
      return failCsharpPlannerInvariant("A checked catch variable requires its declaration name.", clause.VariableDeclaration);
    }
    const order = input.program.records.nativeUse.order(node);
    if (order === undefined) failCsharpPlannerInvariant("A catch clause requires its admitted native construction order.", node);
    if (!order.some(step => step.kind === "construct" && step.construct === clause.VariableDeclaration)) {
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    if (variableName !== undefined && (HasSourceKind(input.program.source.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, variableName, KindArrayBindingPattern))) {
      return failCsharpPlannerInvariant("An admitted catch binding cannot retain destructuring.", variableName);
    }
    const carrier = input.program.records.storageType.get(variable.name);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
    const throwable = input.program.records.throwable.get(variable.name);
    if (throwable === undefined) {
      return failCsharpPlannerInvariant("An admitted catch binding lost its native throwable classification.", variable.name);
    }
    if (!throwable && !isCsharpJsValueTargetType(carrier)) {
      return failCsharpPlannerInvariant("An admitted catch binding lost its native exception or closed value carrier.", variable.name);
    }
    if (variableType === undefined) {
      return failCsharpPlannerInvariant("An admitted catch binding lost its exact native type rendering.", variable.name);
    }
    if (isCsharpJsValueTargetType(carrier)) {
      const catchExceptionType = csharpCatchExceptionType();
      const catchExceptionName = allocateCatchValue(state);
      const sourceVariableName = declareCsharpLocalBindingName(variable.name!, input, state);
      const catchValueInitializer = csharpThrownValueToValueExpression({ kind: "IdentifierName", name: catchExceptionName });
      if (catchExceptionType === undefined || catchValueInitializer === undefined) {
        return failCsharpPlannerInvariant("The fixed native catch bridge requires its declared System.Exception and TsThrownValueException type syntax.", variable.name);
      }
      const locationIdentity = planCsharpTypedLocationIdentityDeclaration(
        clause.VariableDeclaration,
        input,
        state,
      );
      return {
        kind: "CatchClause",
        variableType: catchExceptionType,
        variableName: catchExceptionName,
        body: {
          kind: "Block",
          statements: [
            {
              kind: "LocalDeclarationStatement",
              type: variableType,
              name: sourceVariableName,
              initializer: catchValueInitializer,
            },
            ...(locationIdentity === undefined ? [] : [locationIdentity]),
            ...planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
          ],
        },
      };
    }
    const sourceVariableName = declareCsharpLocalBindingName(variable.name!, input, state);
    const locationIdentity = planCsharpTypedLocationIdentityDeclaration(
      clause.VariableDeclaration,
      input,
      state,
    );
    return {
      kind: "CatchClause",
      variableType,
      variableName: sourceVariableName,
      body: {
        kind: "Block",
        statements: [
          ...(locationIdentity === undefined ? [] : [locationIdentity]),
          ...planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        ],
      },
    };
  }
  return {
    kind: "CatchClause",
    body: {
      kind: "Block",
      statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
    },
  };
}
