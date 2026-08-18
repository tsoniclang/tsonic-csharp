import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  readCsharpLanguageDialect,
  readCsharpMemorySafetyRules,
} from "../../../options/csharp-target-options.js";
import type {
  CsharpSafetyApplication,
} from "../../../analysis/safety/application-index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpAccessorModifier,
  CsharpExpression,
  CsharpModifier,
} from "../../roslyn/syntax.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  createDestructuringPlannerState,
} from "../bindings/index.js";
import {
  AsExpressionStatement,
  AsParenthesizedExpression,
} from "@tsonic/target-api/source";

export type CsharpExplicitSafetyExpressionPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpExpression };

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
  ) => CsharpExpression | undefined,
): CsharpExplicitSafetyExpressionPlan {
  const selected = exactSafetyOperation(node, input);
  if (selected?.kind !== "unsafe-context") {
    if (selected?.kind === "safety-builder") {
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED",
        "C# declaration safety markers must be complete standalone expression statements.",
      ));
      return { handled: true };
    }
    return { handled: false };
  }
  if (selected.fact.kind !== "expression") {
    diagnostics.push(targetDiagnostic(
      "CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID",
      "The no-argument unsafe-context marker must be handled as the first direct statement of a source block.",
    ));
    return { handled: true };
  }
  if (readCsharpLanguageDialect(input.target) !== "csharp15-preview") {
    diagnostics.push(targetDiagnostic(
      "CSHARP_UNSAFE_EXPRESSION_DIALECT_UNSUPPORTED",
      "C# unsafe expressions require target option languageDialect='csharp15-preview'.",
    ));
    return { handled: true };
  }
  const expressionFact = selected.fact;
  const plannerState = state ?? createDestructuringPlannerState(
    sourceFile,
    input.ast,
  );
  const expression = withExplicitUnsafeContext(plannerState, () =>
    planExpression(
      expressionFact.expression,
      sourceFile,
      input,
      diagnostics,
      plannerState,
    ));
  return {
    handled: true,
    ...(expression === undefined
      ? {}
      : { expression: { kind: "UnsafeExpression", expression } }),
  };
}

export function isExplicitUnsafeBlockMarker(
  statement: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  const expression = statement === undefined
    ? undefined
    : AsExpressionStatement(input.ast, statement)?.Expression;
  const selected = expression === undefined
    ? undefined
    : exactSafetyOperation(expression, input);
  return selected?.kind === "unsafe-context" &&
    selected.fact.kind === "remaining-block";
}

export function isErasedSafetyExpressionStatement(
  statement: Node,
  input: CsharpPlanningContext,
): boolean {
  const expression = AsExpressionStatement(input.ast, statement)?.Expression;
  if (expression === undefined) {
    return false;
  }
  const selected = exactSafetyOperation(expression, input);
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
    readCsharpLanguageDialect(input.target) !== "csharp15-preview" ||
    readCsharpMemorySafetyRules(input.target) !== "preview"
  ) {
    return [];
  }
  const applications = uniqueApplications([
    ...input.safetyApplications.forDeclaration(declaration),
    ...(additionalDeclaration === undefined
      ? []
      : input.safetyApplications.forDeclaration(additionalDeclaration)),
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

export function diagnoseUnavailableCsharpSafetyAccessors(
  declaration: Node,
  availablePlacements: readonly ("getter" | "setter")[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  if (
    readCsharpLanguageDialect(input.target) !== "csharp15-preview" ||
    readCsharpMemorySafetyRules(input.target) !== "preview"
  ) {
    return;
  }
  const available = new Set(availablePlacements);
  for (const application of uniqueApplications(
    input.safetyApplications.forDeclaration(declaration),
  )) {
    if (
      application.contract !== "requires-unsafe" ||
      (application.applicationPlacement !== "getter" &&
        application.applicationPlacement !== "setter") ||
      available.has(application.applicationPlacement)
    ) {
      continue;
    }
    diagnostics.push(targetDiagnostic(
      "CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
      `The selected source ${application.applicationPlacement} has no corresponding emitted C# accessor for its explicit safety contract.`,
    ));
  }
}

export function diagnoseCsharpSafetyApplications(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  const applications = input.safetyApplications.forSourceFile(sourceFile);
  const conflicts = diagnoseConflictingSafetyApplications(
    sourceFile,
    input,
    diagnostics,
  );
  for (const application of applications) {
    if (application.targetDeclarations.length === 0) {
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFETY_APPLICATION_TARGET_NOT_RESOLVED",
        "The finalized safety application has no exact emitted C# declaration target.",
      ));
      continue;
    }
    if (application.targetDeclarations.some((declaration) =>
      conflicts.has(declaration)
    )) {
      continue;
    }
    if (readCsharpLanguageDialect(input.target) !== "csharp15-preview") {
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFETY_CONTRACT_DIALECT_UNSUPPORTED",
        "C# declaration caller-safety contracts require target option languageDialect='csharp15-preview'.",
      ));
      continue;
    }
    if (application.contract === "safe") {
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFE_DECLARATION_TARGET_UNSUPPORTED",
        "C# 'safe' is only legal on target declarations that require an explicit safe-or-unsafe choice; current Tsonic source declarations do not represent such a boundary.",
      ));
      continue;
    }
    if (readCsharpMemorySafetyRules(input.target) !== "preview") {
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFETY_CONTRACT_RULES_UNSUPPORTED",
        "C# declaration caller-safety contracts require target option memorySafetyRules='preview'; selecting preview syntax alone does not opt the assembly into updated memory-safety rules.",
      ));
    }
  }
}

function diagnoseConflictingSafetyApplications(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): ReadonlySet<Node> {
  const conflicts = new Set<Node>();
  for (const application of input.safetyApplications.forSourceFile(sourceFile)) {
    for (const declaration of application.targetDeclarations) {
      if (conflicts.has(declaration)) {
        continue;
      }
      const related = input.safetyApplications.forDeclaration(declaration)
        .filter((candidate) =>
          candidate.applicationPlacement === application.applicationPlacement);
      if (new Set(related.map((candidate) => candidate.contract)).size <= 1) {
        continue;
      }
      conflicts.add(declaration);
      const first = [...related].sort((left, right) =>
        compareSafetyApplications(left, right, input)
      )[0];
      if (first?.sourceFile !== sourceFile) {
        continue;
      }
      diagnostics.push(targetDiagnostic(
        "CSHARP_SAFETY_CONTRACT_CONFLICT",
        "One exact C# declaration received conflicting finalized safe and requires-unsafe contracts.",
      ));
    }
  }
  return conflicts;
}

function exactSafetyOperation(
  expression: Node,
  input: CsharpPlanningContext,
) {
  let current: Node | undefined = expression;
  while (current !== undefined) {
    const operation = input.safetyApplications.operationForSubject(current);
    if (operation !== undefined) {
      return operation;
    }
    current = AsParenthesizedExpression(input.ast, current)?.Expression;
  }
  return undefined;
}

function uniqueApplications(
  applications: readonly CsharpSafetyApplication[],
): readonly CsharpSafetyApplication[] {
  return [...new Set(applications)];
}

function compareSafetyApplications(
  left: CsharpSafetyApplication,
  right: CsharpSafetyApplication,
  input: CsharpPlanningContext,
): number {
  const leftPath = input.ast.getPath(left.sourceFile);
  const rightPath = input.ast.getPath(right.sourceFile);
  const pathOrder = leftPath.localeCompare(rightPath);
  return pathOrder !== 0
    ? pathOrder
    : input.ast.pos(left.sourceSubject) - input.ast.pos(right.sourceSubject);
}

function uniqueValues<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function targetDiagnostic(
  code: string,
  message: string,
): TargetDiagnostic {
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
  };
}
