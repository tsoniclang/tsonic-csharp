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

export function planForStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsForStatement(node)!;
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
