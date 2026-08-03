import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
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
import {
  planAttributesForSubject,
} from "./attributes.js";
import {
  publishCsharpSourceCallableContract,
} from "./source-callable-contracts.js";

export function planClassStaticBlockDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsClassStaticBlockDeclaration(node)!;
  const state = createDestructuringPlannerState(node, input.ast);
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["static"],
    parameters: [],
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
    },
  };
}

export function planConstructorDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsConstructorDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "constructor declaration", diagnostics);
  const bodyStatements = AsBlock(declaration.Body)?.Statements?.Nodes ?? [];
  const leadingSuperCall = getLeadingSuperCall(bodyStatements, input);
  const state = createDestructuringPlannerState(node, input.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const classDeclaration = input.ast.parent(node);
  const constructedType = classDeclaration === undefined
    ? undefined
    : input.types.resolveNode(classDeclaration, sourceFile);
  publishCsharpSourceCallableContract(
    node,
    parameters.targetParameters,
    constructedType,
    input,
    diagnostics,
  );
  const baseArguments = leadingSuperCall === undefined
    ? undefined
    : planBaseConstructorArguments(leadingSuperCall.Arguments?.Nodes ?? [], sourceFile, input, diagnostics);
  if (leadingSuperCall !== undefined && baseArguments === undefined) {
    return {
      kind: "ConstructorDeclaration",
      name: className,
      modifiers: ["public"],
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      parameters: parameters.parameters,
      body: { kind: "Block", statements: [] },
    };
  }
  if (leadingSuperCall !== undefined && parameters.prelude.length > 0 && (leadingSuperCall.Arguments?.Nodes ?? []).length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Constructor base arguments cannot reference destructured parameter locals until base-argument rewriting is finalized."));
  }
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    parameters: parameters.parameters,
    ...(leadingSuperCall === undefined
      ? {}
      : { baseArguments }),
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

function planBaseConstructorArguments(
  argumentNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpArgument[] | undefined {
  const planned: CsharpArgument[] = [];
  for (const argument of argumentNodes) {
    if (argument === undefined) {
      continue;
    }
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
  }
  return planned;
}

function getLeadingSuperCall(statements: readonly (Node | undefined)[], input: CsharpTranslationContext): NonNullable<ReturnType<typeof AsCallExpression>> | undefined {
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
