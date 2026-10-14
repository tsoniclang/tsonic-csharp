import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSafetyApplication } from "../../../target-model/records/safety.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpAccessorModifier,
  CsharpModifier,
} from "../../target-ast/syntax/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  createDestructuringPlannerState,
} from "../bindings/index.js";
import {
  AsExpressionStatement,
} from "@tsonic/target-api/source";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { captureCsharpPlannedValue } from "../expressions/planned-value-composition.js";

export type CsharpExplicitSafetyExpressionPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpPlannedValue };

export function tryPlanCsharpExplicitSafetyExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
    state: DestructuringPlannerState,
  ) => CsharpPlannedValue | undefined,
): CsharpExplicitSafetyExpressionPlan {
  const selected = input.program.records.safetyOperation.get(node);
  if (selected?.kind !== "unsafe-context") {
    if (selected?.kind === "safety-builder") {
      return failTargetPlannerInvariant("tsonic-csharp", "C# safety admission left a declaration safety marker in a runtime expression position.", node);
    }
    return { handled: false };
  }
  if (selected.fact.kind !== "expression") {
    return failTargetPlannerInvariant("tsonic-csharp", "C# safety admission left a no-argument unsafe-context marker in an expression position.", node);
  }
  if (input.program.configuration.languageDialect !== "csharp15-preview") {
    return failTargetPlannerInvariant("tsonic-csharp", "C# safety admission left an unsafe expression without languageDialect='csharp15-preview'.", node);
  }
  const expressionFact = selected.fact;
  const plannerState = state ?? createDestructuringPlannerState(
    sourceFile,
    input.program.source.ast,
  );
  const expression = withExplicitUnsafeContext(plannerState, () =>
    planExpression(
      expressionFact.expression,
      sourceFile,
      input,
      diagnostics,
      plannerState,
    ));
  if (expression === undefined) return { handled: true };
  if (expression.completion.kind !== "value") return { handled: true, expression: {
    prelude: [{ kind: "UnsafeStatement", body: { kind: "Block", statements: expression.prelude } }],
    completion: expression.completion,
  } };
  if (expression.prelude.length === 0) return { handled: true, expression: csharpPlannedValue(
    expression.completion.carrier, { kind: "UnsafeExpression", expression: expression.completion.expression },
  ) };
  const storage = captureCsharpPlannedValue(node, input, diagnostics, expression.completion.carrier);
  if (storage === undefined) return { handled: true };
  const reference = { kind: "IdentifierName" as const, name: storage.name };
  return { handled: true, expression: csharpPlannedValue(expression.completion.carrier, reference, [
    { kind: "LocalDeclarationStatement", ...storage },
    { kind: "UnsafeStatement", body: { kind: "Block", statements: [...expression.prelude, {
      kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: reference,
        operatorToken: { kind: "EqualsToken" }, right: expression.completion.expression },
    }] } },
  ]) };
}

export function isExplicitUnsafeBlockMarker(
  statement: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  const expression = statement === undefined
    ? undefined
    : AsExpressionStatement(input.program.source.ast, statement)?.Expression;
  const selected = expression === undefined
    ? undefined
    : input.program.records.safetyOperation.get(expression);
  return selected?.kind === "unsafe-context" &&
    selected.fact.kind === "remaining-block";
}

export function isErasedSafetyExpressionStatement(
  statement: Node,
  input: CsharpPlanningContext,
): boolean {
  const expression = AsExpressionStatement(input.program.source.ast, statement)?.Expression;
  if (expression === undefined) {
    return false;
  }
  const selected = input.program.records.safetyOperation.get(expression);
  return selected?.kind === "safety-builder" ||
    (selected?.kind === "unsafe-context" &&
      selected.fact.kind === "remaining-block");
}

export function withExplicitUnsafeContext<T>(
  state: DestructuringPlannerState,
  action: () => T,
): T {
  state.explicitUnsafeContextDepth += 1;
  try {
    return action();
  } finally {
    state.explicitUnsafeContextDepth -= 1;
  }
}

export function csharpSafetyModifiersForDeclaration(
  declaration: Node,
  placement: CsharpSafetyApplication["applicationPlacement"],
  input: CsharpPlanningContext,
  additionalDeclaration?: Node,
): readonly CsharpModifier[] {
  if (
    input.program.configuration.languageDialect !== "csharp15-preview" ||
    input.program.configuration.memorySafetyRules !== "preview"
  ) {
    return [];
  }
  const applications = uniqueApplications([
    ...input.program.records.safetyApplication.get(declaration),
    ...(additionalDeclaration === undefined
      ? []
      : input.program.records.safetyApplication.get(additionalDeclaration)),
  ]).filter((application) => application.applicationPlacement === placement);
  const contracts = new Set(applications.map((application) =>
    application.contract));
  if (contracts.size !== 1) {
    return [];
  }
  return contracts.has("requires-unsafe") ? ["unsafe"] : [];
}

export function withCsharpSafetyModifiers(
  modifiers: readonly CsharpModifier[],
  declaration: Node,
  placement: CsharpSafetyApplication["applicationPlacement"],
  input: CsharpPlanningContext,
  additionalDeclaration?: Node,
): readonly CsharpModifier[] {
  return uniqueValues([
    ...modifiers,
    ...csharpSafetyModifiersForDeclaration(
      declaration,
      placement,
      input,
      additionalDeclaration,
    ),
  ]);
}

export function csharpSafetyAccessorModifiersForDeclaration(
  declaration: Node,
  placement: "getter" | "setter",
  input: CsharpPlanningContext,
  additionalDeclaration?: Node,
): readonly CsharpAccessorModifier[] {
  return csharpSafetyModifiersForDeclaration(
    declaration,
    placement,
    input,
    additionalDeclaration,
  ).flatMap((modifier): CsharpAccessorModifier[] =>
    modifier === "safe" || modifier === "unsafe" ? [modifier] : []
  );
}

function uniqueApplications(
  applications: readonly CsharpSafetyApplication[],
): readonly CsharpSafetyApplication[] {
  return [...new Set(applications)];
}

function uniqueValues<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
