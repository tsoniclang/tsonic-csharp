import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsCatchClause,
  AsTryStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpCatchClause,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";
import {
  allocateCatchValue,
  declareCsharpLocalBindingName,
} from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import { isCsharpThrowableCarrier } from "./statement-output.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import {
  csharpCatchExceptionType,
  csharpThrownValueToValueExpression,
} from "./exception-flow.js";
import {
  isCsharpTsValueTargetType,
} from "../../policy/types/index.js";

export type BlockStatementPlanner = (
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
    const primaryCarrierResolution = resolveRuntimeCarrierForExpression(input, variable.name ?? clause.VariableDeclaration, sourceFile);
    const primaryCarrier = probeCarrierFromResolution(primaryCarrierResolution);
    const declarationCarrierResolution = primaryCarrier === undefined
      ? resolveRuntimeCarrierForExpression(input, clause.VariableDeclaration, sourceFile)
      : undefined;
    const carrier = primaryCarrier ?? probeCarrierFromResolution(declarationCarrierResolution);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
    if (
      !isCsharpThrowableCarrier(carrier) &&
      !(readCsharpTypescriptCompatibilityMode(input.target) === "compat" && isCsharpTsValueTargetType(carrier))
    ) {
      const detail = carrier === undefined
        ? missingCarrierDiagnosticDetail(declarationCarrierResolution ?? primaryCarrierResolution, "Runtime carrier fact is missing for the catch variable.")
        : { reason: "Resolved catch variable carrier is neither a target throwable carrier nor a closed TsValue compatibility catch carrier.", evidence: [] };
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? clause.VariableDeclaration, `Catch variables require finalized TSTS/provider exception-carrier facts before C# emission. ${detail.reason}`, detail.evidence));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    if (variableType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? clause.VariableDeclaration, "Catch variable carrier must render to a closed C# type before C# emission."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    if (variable.name === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(clause.VariableDeclaration, "Catch variable declarations require a source binding name before C# emission."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    if (!catchVariableHasReferences(variable.name, sourceFile, input)) {
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    if (isCsharpTsValueTargetType(carrier)) {
      const catchExceptionType = csharpCatchExceptionType();
      const catchExceptionName = allocateCatchValue(state);
      const sourceVariableName = declareCsharpLocalBindingName(variable.name, sourceFile, input, diagnostics, state, "Catch variable", "catchValue");
      const catchValueInitializer = csharpThrownValueToValueExpression({ kind: "IdentifierName", name: catchExceptionName });
      if (catchExceptionType === undefined || catchValueInitializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(variable.name, "C# compatibility catch variables require renderable System.Exception and TsThrownValueException target carriers."));
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
            ...planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
          ],
        },
      };
    }
    const sourceVariableName = declareCsharpLocalBindingName(variable.name, sourceFile, input, diagnostics, state, "Catch variable", "catchValue");
    return {
      kind: "CatchClause",
      variableType,
      variableName: sourceVariableName,
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

function catchVariableHasReferences(
  variableName: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const symbol = input.semantics(sourceFile).getSymbolAtLocation(
    variableName,
  );
  if (symbol === undefined) {
    return true;
  }
  return input.navigation.hasReferenceOutside(symbol, variableName);
}
