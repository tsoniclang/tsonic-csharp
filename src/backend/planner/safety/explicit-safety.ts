import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSafetyApplication, CsharpSafetyOperation } from "../../../target-model/records/safety.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpAccessorModifier, CsharpModifier } from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { createDestructuringPlannerState } from "../bindings/index.js";
import { AsExpressionStatement } from "@tsonic/target-api/source";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { captureCsharpPlannedValue } from "../expressions/planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import type { TargetTypeRef, CsharpObjectShapeFact } from "../../../target-model/types/model.js";

export function planCsharpExplicitSafetyExpression(
  node: Node,
  selected: CsharpSafetyOperation,
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
): CsharpPlannedValue | undefined {
  if (selected.kind !== "unsafe-context" || selected.fact.kind !== "expression")
    failCsharpPlannerInvariant("An admitted unsafe expression requires its exact source operand and placement.", node);
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
  if (expression === undefined) return undefined;
  if (expression.completion.kind !== "value") return {
    prelude: [{ kind: "UnsafeStatement", body: { kind: "Block", statements: expression.prelude } }],
    completion: expression.completion,
  };
  if (expression.prelude.length === 0) return csharpPlannedValue(
    expression.completion.carrier, { kind: "UnsafeExpression", expression: expression.completion.expression },
  );
  const storage = captureCsharpPlannedValue(node, input, diagnostics, expression.completion.carrier);
  if (storage === undefined) return undefined;
  const reference = { kind: "IdentifierName" as const, name: storage.name };
  return csharpPlannedValue(expression.completion.carrier, reference, [
    { kind: "LocalDeclarationStatement", ...storage },
    { kind: "UnsafeStatement", body: { kind: "Block", statements: [...expression.prelude, {
      kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: reference,
        operatorToken: { kind: "EqualsToken" }, right: expression.completion.expression },
    }] } },
  ]);
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


export function csharpSafetyModifiersForDeclaration(declaration: Node, placement: CsharpSafetyApplication["applicationPlacement"],
  input: CsharpPlanningContext, additionalDeclaration?: Node): readonly CsharpModifier[] {
  const selected = input.program.records.declarationSafety.get(declaration, placement);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted declaration requires its sealed native safety modifiers.", declaration);
  if (additionalDeclaration === undefined) return selected;
  const additional = input.program.records.declarationSafety.get(additionalDeclaration, placement);
  if (additional === undefined) failCsharpPlannerInvariant("An admitted declaration requires its additional sealed safety modifiers.", additionalDeclaration);
  return [...new Set([...selected, ...additional])];
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


function uniqueValues<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export function csharpCompilationRequiresUnsafe(subject: Node | "object-shapes" | "source-unions", input: CsharpPlanningContext): boolean {
  return input.program.records.unsafeCompilation.get(subject)
    ?? failCsharpPlannerInvariant("An admitted compilation unit requires its exact native unsafe permission.",
      typeof subject === "string" ? undefined : subject);
}

export function csharpTypeSafetyModifiers(input: CsharpPlanningContext, carrier: TargetTypeRef): readonly CsharpModifier[] {
  const selected = input.program.records.typeEmission.get(carrier);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native type requires its selected unsafe context.");
  return selected.unsafeContext ? ["unsafe"] : [];
}

export function csharpObjectShapeSafetyModifiers(input: CsharpPlanningContext, fact: CsharpObjectShapeFact): readonly CsharpModifier[] {
  const selected = input.program.records.unsafeShape.get(fact);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native object shape requires its selected unsafe context.");
  return selected ? ["unsafe"] : [];
}
