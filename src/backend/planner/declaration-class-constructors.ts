import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpConstructorDeclaration,
} from "../roslyn/syntax.js";
import {
  AsBlock,
  AsCallExpression,
  AsClassStaticBlockDeclaration,
  AsConstructorDeclaration,
  AsExpressionStatement,
  HasSourceKind,
  KindCallExpression,
  KindExpressionStatement,
  KindSuperKeyword,
} from "./source-ast.js";
import {
  createDestructuringPlannerState,
} from "./bindings.js";
import {
  planCallArgument,
} from "./expressions.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "./modifiers.js";
import {
  planParametersWithPrelude,
} from "./parameters.js";
import {
  planBlockStatements,
  planStatements,
} from "./statements.js";

export function planClassStaticBlockDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsClassStaticBlockDeclaration(node)!;
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["static"],
    parameters: [],
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

export function planConstructorDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsConstructorDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "constructor declaration", diagnostics);
  const bodyStatements = AsBlock(declaration.Body)?.Statements?.Nodes ?? [];
  const leadingSuperCall = getLeadingSuperCall(bodyStatements, input);
  const state = createDestructuringPlannerState();
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  if (leadingSuperCall !== undefined && parameters.prelude.length > 0 && (leadingSuperCall.Arguments?.Nodes ?? []).length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Constructor base arguments cannot reference destructured parameter locals until base-argument rewriting is finalized."));
  }
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["public"],
    parameters: parameters.parameters,
    ...(leadingSuperCall === undefined
      ? {}
      : {
          baseArguments: (leadingSuperCall.Arguments?.Nodes ?? [])
            .filter((argument): argument is Node => argument !== undefined)
            .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
        }),
    body: {
      kind: "Block",
      statements: leadingSuperCall === undefined
        ? [
            ...parameters.prelude,
            ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
          ]
        : [
            ...parameters.prelude,
            ...bodyStatements
              .slice(1)
              .filter((statement): statement is Node => statement !== undefined)
              .flatMap((statement) => planStatements(statement, sourceFile, input, diagnostics, state)),
          ],
    },
  };
}

function getLeadingSuperCall(statements: readonly (Node | undefined)[], input: TargetCompileInput): NonNullable<ReturnType<typeof AsCallExpression>> | undefined {
  const first = statements[0];
  if (!HasSourceKind(input.ast, first, KindExpressionStatement)) {
    return undefined;
  }
  const expression = AsExpressionStatement(first)!.Expression;
  if (!HasSourceKind(input.ast, expression, KindCallExpression)) {
    return undefined;
  }
  const call = AsCallExpression(expression)!;
  return HasSourceKind(input.ast, call.Expression, KindSuperKeyword) ? call : undefined;
}
