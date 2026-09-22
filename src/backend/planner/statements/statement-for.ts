import type { CsharpPlanningContext } from "../context.js";
import {
  AsForStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpForInitializer,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  sameCsharpType,
} from "../types/index.js";
import {
  planExpression,
} from "../expressions/index.js";
import {
  planConditionExpression,
} from "./statement-conditionals.js";
import {
  planLocalDeclaration,
  planLocalDeclarationStatements,
} from "../bindings/locals.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";
import { planResourceScopeStatements } from "./resource-management.js";
import { planCsharpCaptureFrame, planCsharpCaptureFrameRotation } from "../bindings/capture-storage.js";
import { csharpSourceExpressionSequence } from "../../../target-model/syntax/expression-sequence.js";
import { expressionStatement, planDiscardedExpression } from "./statement-output.js";

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
  const conditionNodes = statement.Condition === undefined ? [] : csharpSourceExpressionSequence(input.program.source.ast, statement.Condition);
  const conditionNode = conditionNodes[conditionNodes.length - 1];
  const condition = conditionNode === undefined
    ? undefined
    : planConditionExpression(conditionNode, "For statement", sourceFile, input, diagnostics, state);
  const conditionPrelude = conditionNodes.slice(0, -1).map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (statement.Condition !== undefined && condition === undefined) {
    return initializer?.prelude ?? [];
  }
  const incrementors = statement.Incrementor === undefined ? [] : csharpSourceExpressionSequence(input.program.source.ast, statement.Incrementor)
    .map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (incrementors.some(expression => expression === undefined) || conditionPrelude.some(expression => expression === undefined)) {
    return initializer?.prelude ?? [];
  }
  const rotation = frame === undefined ? undefined : planCsharpCaptureFrameRotation(frame, input, diagnostics, state);
  const body = planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state);
  const outerLabels = new Set(state.controlLabels.flatMap(target => [target.breakLabel,
    ...(target.continueLabel === undefined || target.loop === node ? [] : [target.continueLabel])]));
  const plannedFor: CsharpStatement = {
    kind: "ForStatement",
    ...(incrementors.length > 0 && exitsBeforeIncrementor(body, outerLabels) ? { unreachableIncrementor: true } : {}),
    ...(initializer?.initializer !== undefined
      ? { initializer: initializer.initializer }
      : {}),
    ...(condition !== undefined && conditionPrelude.length === 0
      ? { condition }
      : {}),
    incrementors: [...(rotation === undefined ? [] : [rotation]), ...incrementors.map(expression => planDiscardedExpression(expression!))],
    body: {
      kind: "Block",
      statements: [
        ...conditionPrelude.map(expression => expressionStatement(planDiscardedExpression(expression!))),
        ...(condition !== undefined && conditionPrelude.length !== 0 ? [{ kind: "IfStatement" as const,
          condition: { kind: "PrefixUnaryExpression" as const, operatorToken: { kind: "ExclamationToken" as const },
            operand: { kind: "ParenthesizedExpression" as const, expression: condition } },
          thenBody: { kind: "Block" as const, statements: [{ kind: "BreakStatement" as const }] },
        }] : []),
        ...body,
      ],
    },
  };
  const initializerPrelude: readonly CsharpStatement[] = [...capturePrelude, ...initializer?.prelude ?? [],
    ...(rotation === undefined ? [] : [{ kind: "ExpressionStatement" as const, expression: rotation }])];
  return initializerPrelude.length === 0
    ? [plannedFor]
    : initializer?.preludeScope === "enclosing"
      ? [...initializerPrelude, plannedFor]
      : [{
        kind: "Block",
        body: { kind: "Block", statements: [...initializerPrelude, plannedFor] },
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
  readonly initializer?: CsharpForInitializer;
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
    if (concreteDeclarations.some(declaration => input.program.captureStorage.binding(declaration) !== undefined)) {
      return { prelude: concreteDeclarations.flatMap(declaration =>
        planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
        ...(declarationKind === "var" ? { preludeScope: "enclosing" as const } : {}),
      };
    }
    if (declarationKind === "using" || declarationKind === "await using") {
      return {
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(
            declaration,
            sourceFile,
            input,
            diagnostics,
            state,
          )),
      };
    }
    if (concreteDeclarations.some((declaration) => {
      const variable = AsVariableDeclaration(input.program.source.ast, declaration)!;
      return HasSourceKind(input.program.source.ast, variable.name, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, variable.name, KindArrayBindingPattern);
    })) {
      return {
        ...(input.program.source.ast.variableDeclarationKind(node) === "var"
          ? { preludeScope: "enclosing" as const }
          : {}),
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
      };
    }
    if (input.program.source.ast.variableDeclarationKind(node) === "var") {
      return {
        preludeScope: "enclosing",
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(
            declaration,
            sourceFile,
            input,
            diagnostics,
            state,
          )
        ),
      };
    }
    const locals = concreteDeclarations
      .map((declaration) => planLocalDeclaration(declaration, sourceFile, input, diagnostics, state));
    const first = locals[0];
    if (first !== undefined && locals.some((local) => !sameCsharpType(local.type, first.type))) {
      return {
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(
            declaration,
            sourceFile,
            input,
            diagnostics,
            state,
          )
        ),
      };
    }
    const identityPrelude = concreteDeclarations.flatMap((declaration) => {
      const identity = planCsharpTypedLocationIdentityDeclaration(
        declaration,
        input,
        state,
      );
      return identity === undefined ? [] : [identity];
    });
    return {
      initializer: {
        kind: "VariableDeclaration",
        locals,
      },
      prelude: identityPrelude,
    };
  }
  const expression = planExpression(node, sourceFile, input, diagnostics, state);
  return {
    initializer: expression === undefined ? undefined : {
      kind: "Expression",
      expression,
    },
    prelude: [],
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
