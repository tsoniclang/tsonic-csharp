import type { CsharpPlanningContext } from "../context.js";
import {
  AsForStatement,
  HasSourceKind,
  KindVariableDeclarationList,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStatement } from "../../target-ast/roslyn/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planExpression,
} from "../expressions/index.js";
import {
  planConditionExpression,
} from "./statement-conditionals.js";
import { planLocalDeclarationStatements } from "../bindings/locals.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import { planResourceScopeStatements } from "./resource-management.js";
import { planCsharpCaptureFrame, planCsharpCaptureFrameRotation } from "../bindings/capture-storage.js";
import { sourceExpressionSequence } from "@tsonic/target-api/source";
import { expressionStatement, planCsharpPlannedDiscard, planDiscardedExpression } from "./statement-output.js";
import { csharpLoopContinuationLabel, planCsharpLoopContinuation } from "./loop-regions.js";

export function planForStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsForStatement(input.program.source.ast, node)!;
  const resource = forInitializerResource(statement.Initializer, input);
  return resource === undefined
    ? planForStatementCore(
        node,
        statement,
        sourceFile,
        input,
        diagnostics,
        state,
        planNestedStatementBody,
      )
    : planResourceScopeStatements(
        resource.declaration,
        resource.kind,
        diagnostics,
        state,
        () => planForStatementCore(
          node,
          statement,
          sourceFile,
          input,
          diagnostics,
          state,
          planNestedStatementBody,
        ),
      );
}

function planForStatementCore(
  node: Node,
  statement: NonNullable<ReturnType<typeof AsForStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const capturePrelude = planCsharpCaptureFrame(node, input, diagnostics, state);
  const frame = input.program.captureStorage.frame(node);
  const initializer = statement.Initializer === undefined
    ? undefined
    : planForInitializer(statement.Initializer, sourceFile, input, diagnostics, state);
  const conditionNodes = statement.Condition === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Condition);
  const conditionNode = conditionNodes[conditionNodes.length - 1];
  const condition = conditionNode === undefined
    ? undefined
    : planConditionExpression(conditionNode, "For statement", sourceFile, input, diagnostics, state);
  const conditionPrelude = conditionNodes.slice(0, -1).map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (statement.Condition !== undefined && condition === undefined) {
    return initializer?.prelude ?? [];
  }
  const incrementorNodes = statement.Incrementor === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Incrementor);
  const incrementors = incrementorNodes
    .map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (incrementors.some(expression => expression === undefined) || conditionPrelude.some(expression => expression === undefined)) {
    return initializer?.prelude ?? [];
  }
  const rotation = frame === undefined ? undefined : planCsharpCaptureFrameRotation(frame, input, diagnostics, state);
  const iterationPrelude = conditionPrelude.flatMap(expression => planCsharpPlannedDiscard(expression!));
  const expandedIncrement = incrementors.some(expression => expression!.prelude.length !== 0 || expression!.completion.kind !== "value");
  const expandedCondition = iterationPrelude.length !== 0 || (condition?.prelude.length ?? 0) !== 0;
  const label = expandedIncrement ? planCsharpLoopContinuation(node, state) : undefined;
  const body = condition?.completion.kind === "never" ? [] : planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state);
  const outerLabels = new Set(state.controlLabels.flatMap(target => [target.breakLabel,
    ...(target.continueLabel === undefined || target.loop === node ? [] : [target.continueLabel])]));
  const incrementStatements = [
    ...(rotation === undefined ? [] : [expressionStatement(rotation)]),
    ...incrementors.flatMap(expression => planCsharpPlannedDiscard(expression!)),
  ];
  const conditionTest: readonly CsharpStatement[] = [...iterationPrelude, ...condition?.prelude ?? [],
    ...(condition?.completion.kind === "value" ? [{ kind: "IfStatement" as const,
      condition: { kind: "PrefixUnaryExpression" as const, operatorToken: { kind: "ExclamationToken" as const },
        operand: { kind: "ParenthesizedExpression" as const, expression: condition.completion.expression } },
      thenBody: { kind: "Block" as const, statements: [{ kind: "BreakStatement" as const }] },
    }] : []),
  ];
  const continuation = label === undefined ? [] : csharpLoopContinuationLabel(node, label, state);
  const plannedFor: CsharpStatement = expandedIncrement ? {
    kind: "WhileStatement",
    condition: !expandedCondition && condition?.completion.kind === "value" ? condition.completion.expression : { kind: "LiteralExpression", value: true },
    body: { kind: "Block", statements: [
      ...(expandedCondition ? conditionTest : []),
      { kind: "Block", body: { kind: "Block", statements: body } },
      ...continuation,
      ...(continuation.length === 0 && exitsBeforeIncrementor(body, outerLabels) ? [] : incrementStatements),
    ] },
  } : {
    kind: "ForStatement",
    ...(incrementors.length > 0 && exitsBeforeIncrementor(body, outerLabels) ? { unreachableIncrementor: true } : {}),
    ...(condition?.completion.kind === "value" && !expandedCondition
      ? { condition: condition.completion.expression }
      : {}),
    incrementors: [...(rotation === undefined ? [] : [rotation]), ...incrementors.flatMap(expression =>
      expression!.completion.kind === "value" ? [planDiscardedExpression(expression!.completion.expression, expression!.completion.carrier)] : [])],
    body: {
      kind: "Block",
      statements: [
        ...(expandedCondition ? conditionTest : []),
        ...body,
      ],
    },
  };
  const initializerPrelude: readonly CsharpStatement[] = [...capturePrelude, ...initializer?.prelude ?? [],
    ...(rotation === undefined ? [] : [{ kind: "ExpressionStatement" as const, expression: rotation }])];
  const loopStatements = condition?.completion.kind === "never" ? conditionTest : [plannedFor];
  return initializerPrelude.length === 0
    ? loopStatements
    : initializer?.preludeScope === "enclosing"
      ? [...initializerPrelude, ...loopStatements]
      : [{
        kind: "Block",
        body: { kind: "Block", statements: [...initializerPrelude, ...loopStatements] },
      }];
}

function exitsBeforeIncrementor(statements: readonly CsharpStatement[], outerLabels: ReadonlySet<string>): boolean {
  const last = statements[statements.length - 1];
  if (last === undefined) return false;
  if (last.kind === "ReturnStatement" || last.kind === "ThrowStatement" || last.kind === "BreakStatement") return true;
  if (last.kind === "GotoStatement") return outerLabels.has(last.label);
  if (last.kind === "Block") return exitsBeforeIncrementor(last.body.statements, outerLabels);
  return last.kind === "IfStatement" && last.elseBody !== undefined &&
    exitsBeforeIncrementor(last.thenBody.statements, outerLabels) && exitsBeforeIncrementor(last.elseBody.statements, outerLabels);
}

interface PlannedForInitializer {
  readonly prelude: readonly CsharpStatement[];
  readonly preludeScope?: "loop" | "enclosing";
}

function planForInitializer(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForInitializer {
  if (HasSourceKind(input.program.source.ast, node, KindVariableDeclarationList)) {
    const concreteDeclarations = input.program.source.ast.children(node)
      .filter((declaration): declaration is Node => declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration));
    const declarationKind = input.program.source.ast.variableDeclarationKind(node);
    return {
      prelude: concreteDeclarations.flatMap(declaration => planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
      ...(declarationKind === "var" ? { preludeScope: "enclosing" as const } : {}),
    };
  }
  const expression = planExpression(node, sourceFile, input, diagnostics, state);
  return {
    prelude: expression === undefined ? [] : planCsharpPlannedDiscard(expression),
  };
}

function forInitializerResource(
  initializer: Node | undefined,
  input: CsharpPlanningContext,
): {
  readonly declaration: Node;
  readonly kind: "sync" | "async";
} | undefined {
  if (!HasSourceKind(input.program.source.ast, initializer, KindVariableDeclarationList)) {
    return undefined;
  }
  const declarations = input.program.source.ast.children(initializer).filter(
    (declaration): declaration is Node =>
      declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration),
  );
  const resourceDeclarations = declarations.filter((declaration) => {
    const kind = input.program.source.ast.variableDeclarationKind(declaration);
    return kind === "using" || kind === "await using";
  });
  const first = resourceDeclarations[0];
  if (first === undefined) {
    return undefined;
  }
  return {
    declaration: first,
    kind: resourceDeclarations.some((declaration) =>
        input.program.source.ast.variableDeclarationKind(declaration) === "await using"
      )
      ? "async"
      : "sync",
  };
}
