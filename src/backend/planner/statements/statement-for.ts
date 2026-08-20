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
  statement: NonNullable<ReturnType<typeof AsForStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const initializer = statement.Initializer === undefined
    ? undefined
    : planForInitializer(statement.Initializer, sourceFile, input, diagnostics, state);
  const condition = statement.Condition === undefined
    ? undefined
    : planConditionExpression(statement.Condition, "For statement", sourceFile, input, diagnostics, state);
  if (statement.Condition !== undefined && condition === undefined) {
    return initializer?.prelude ?? [];
  }
  const incrementor = statement.Incrementor === undefined
    ? undefined
    : planExpression(statement.Incrementor, sourceFile, input, diagnostics, state);
  if (statement.Incrementor !== undefined && incrementor === undefined) {
    return initializer?.prelude ?? [];
  }
  const plannedFor: CsharpStatement = {
    kind: "ForStatement",
    ...(initializer?.initializer !== undefined
      ? { initializer: initializer.initializer }
      : {}),
    ...(statement.Condition !== undefined
      ? { condition }
      : {}),
    ...(statement.Incrementor !== undefined
      ? { incrementor }
      : {}),
    body: {
      kind: "Block",
      statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
    },
  };
  const initializerPrelude = initializer?.prelude ?? [];
  return initializerPrelude.length === 0
    ? [plannedFor]
    : initializer?.preludeScope === "enclosing"
      ? [...initializerPrelude, plannedFor]
      : [{
        kind: "Block",
        body: { kind: "Block", statements: [...initializerPrelude, plannedFor] },
      }];
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
