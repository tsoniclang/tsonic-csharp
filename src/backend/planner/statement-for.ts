import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsForStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpForInitializer,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  sameCsharpType,
} from "./csharp-types.js";
import {
  planExpression,
} from "./expressions.js";
import {
  planConditionExpression,
} from "./statement-conditionals.js";
import {
  planLocalDeclaration,
  planLocalDeclarationStatements,
} from "./locals.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";
import { planResourceScopeStatements } from "./resource-management.js";

export function planForStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsForStatement(node)!;
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
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForInitializer {
  if (HasSourceKind(input.ast, node, KindVariableDeclarationList)) {
    const concreteDeclarations = input.ast.children(node)
      .filter((declaration): declaration is Node => declaration !== undefined && input.ast.is.IsVariableDeclaration(declaration));
    const declarationKind = input.ast.variableDeclarationKind(node);
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
      const variable = AsVariableDeclaration(declaration)!;
      return HasSourceKind(input.ast, variable.name, KindObjectBindingPattern) || HasSourceKind(input.ast, variable.name, KindArrayBindingPattern);
    })) {
      return {
        ...(input.ast.variableDeclarationKind(node) === "var"
          ? { preludeScope: "enclosing" as const }
          : {}),
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
      };
    }
    if (input.ast.variableDeclarationKind(node) === "var") {
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
  input: CsharpTranslationContext,
): {
  readonly declaration: Node;
  readonly kind: "sync" | "async";
} | undefined {
  if (!HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    return undefined;
  }
  const declarations = input.ast.children(initializer).filter(
    (declaration): declaration is Node =>
      declaration !== undefined && input.ast.is.IsVariableDeclaration(declaration),
  );
  const resourceDeclarations = declarations.filter((declaration) => {
    const kind = input.ast.variableDeclarationKind(declaration);
    return kind === "using" || kind === "await using";
  });
  const first = resourceDeclarations[0];
  if (first === undefined) {
    return undefined;
  }
  return {
    declaration: first,
    kind: resourceDeclarations.some((declaration) =>
        input.ast.variableDeclarationKind(declaration) === "await using"
      )
      ? "async"
      : "sync",
  };
}
