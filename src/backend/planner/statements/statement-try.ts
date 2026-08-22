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
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type {
  CsharpCatchClause,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import {
  allocateCatchValue,
  declareCsharpLocalBindingName,
} from "../bindings/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForStorage,
} from "../types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  csharpCatchExceptionType,
  csharpThrownValueToValueExpression,
  isExactUnmodifiedCatchRethrow,
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
    if (variableName !== undefined && (HasSourceKind(input.program.source.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, variableName, KindArrayBindingPattern))) {
      diagnostics.push(unsupportedNodeDiagnostic(variableName, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#."));
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
    if (!catchVariableRequiresTargetBinding(variable.name, clause.Block, input)) {
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    const carrierResolution = resolveRuntimeCarrierForStorage(
      input,
      variable.name,
      sourceFile,
    );
    const carrier = probeCarrierFromResolution(carrierResolution);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
    const throwable = input.program.operations.throwable(variable.name);
    if (throwable === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        variable.name,
        "Catch variable has no sealed C# throwable classification.",
      ));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(
            clause.Block,
            sourceFile,
            input,
            diagnostics,
            state,
          ),
        },
      };
    }
    if (!throwable && !isCsharpJsValueTargetType(carrier)) {
      const detail = carrier === undefined
        ? missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the catch variable.")
        : { reason: "Resolved catch variable carrier is neither a target throwable carrier nor a closed TsValue catch carrier.", evidence: [] };
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
    if (isCsharpJsValueTargetType(carrier)) {
      const catchExceptionType = csharpCatchExceptionType();
      const catchExceptionName = allocateCatchValue(state);
      const sourceVariableName = declareCsharpLocalBindingName(variable.name, input, diagnostics, state, "Catch variable", "catchValue");
      const catchValueInitializer = csharpThrownValueToValueExpression({ kind: "IdentifierName", name: catchExceptionName });
      if (catchExceptionType === undefined || catchValueInitializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(variable.name, "Dynamic C# catch variables require renderable System.Exception and TsThrownValueException target carriers."));
        return {
          kind: "CatchClause",
          body: {
            kind: "Block",
            statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
          },
        };
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
    const sourceVariableName = declareCsharpLocalBindingName(variable.name, input, diagnostics, state, "Catch variable", "catchValue");
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

function catchVariableRequiresTargetBinding(
  variableName: Node,
  catchBlock: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  const binding = input.program.sourceNavigation.referenceFor(variableName);
  if (binding === undefined || catchBlock === undefined) {
    return true;
  }
  let required = false;
  const visit = (node: Node | undefined): void => {
    if (node === undefined || required) {
      return;
    }
    const reference = input.program.sourceNavigation.referenceFor(node);
    if (
      !sourceNodesEqual(input.program.source.ast, node, variableName) &&
      reference?.symbol === binding.symbol
    ) {
      const parent = input.program.source.ast.parent(node);
      if (
        parent === undefined ||
        !input.program.source.ast.is.IsThrowStatement(parent) ||
        !sourceNodesEqual(
          input.program.source.ast,
          input.program.source.ast.as.AsThrowStatement(parent)?.Expression,
          node,
        ) ||
        !isExactUnmodifiedCatchRethrow(parent, node, input)
      ) {
        required = true;
        return;
      }
    }
    input.program.source.ast.forEachChild(node, visit);
  };
  visit(catchBlock);
  return required;
}
