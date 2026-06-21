import {
  AsCatchClause,
  AsTryStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpCatchClause,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { isCsharpExceptionCarrier } from "./statement-output.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

export type BlockStatementPlanner = (
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBlockStatements: BlockStatementPlanner,
): CsharpStatement {
  const statement = AsTryStatement(node)!;
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBlockStatements: BlockStatementPlanner,
): CsharpCatchClause {
  const clause = AsCatchClause(node)!;
  if (clause.VariableDeclaration !== undefined) {
    const variable = AsVariableDeclaration(clause.VariableDeclaration)!;
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      diagnostics.push(unsupportedNodeDiagnostic(variableName, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    const carrier = getRuntimeCarrierForExpression(input, variable.name ?? clause.VariableDeclaration, sourceFile) ??
      getRuntimeCarrierForExpression(input, clause.VariableDeclaration, sourceFile);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
    if (!isCsharpExceptionCarrier(carrier) || variableType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? clause.VariableDeclaration, "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    return {
      kind: "CatchClause",
      variableType,
      variableName: variable.name === undefined ? undefined : sanitizeIdentifier(Node_Text(variable.name)),
      body: {
        kind: "Block",
        statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
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
