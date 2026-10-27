import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpOptionalLocalOperation, CsharpOptionalLocalPlacement, CsharpOptionalLocalValue } from "../../../target-model/records/storage/local-bindings.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { allocateExpressionTemp } from "../bindings/binding-state.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";
import { csharpPlannedEffect, csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpValueBranch } from "./planned-value-composition.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";

const identifier = (name: string): CsharpExpression => ({ kind: "IdentifierName", name });
const assignment = (name: string, expression: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement",
  expression: { kind: "AssignmentExpression", left: identifier(name), operatorToken: { kind: "EqualsToken" }, right: expression } });

function payloadType(placement: CsharpOptionalLocalPlacement, input: CsharpPlanningContext): CsharpTypeNode {
  return csharpTypeFromTargetTypeRef(placement.payload, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("A private optional local requires its sealed payload type.", placement.declaration);
}

function clearPayload(placement: CsharpOptionalLocalPlacement, input: CsharpPlanningContext): CsharpExpression {
  return { kind: "DefaultExpression", type: payloadType(placement, input), nullForgiving: true };
}

function planValue(value: CsharpOptionalLocalValue, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state: DestructuringPlannerState): CsharpPlannedValue | undefined {
  return value.expression === undefined || value.kind === "copy" ? undefined
    : planExpression(value.expression, sourceFile, { ...input, storageExpression: value.expression }, diagnostics, state);
}

function planWrite(placement: CsharpOptionalLocalPlacement, value: CsharpOptionalLocalValue,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state: DestructuringPlannerState): CsharpPlannedValue {
  if (value.kind === "copy") {
    const presence = allocateExpressionTemp(state);
    return csharpPlannedEffect(csharpVoidTargetType(), [
      { kind: "LocalDeclarationStatement", name: presence, type: { kind: "PredefinedType", name: "bool" },
        initializer: identifier(value.placement.presenceName) },
      assignment(placement.payloadName, { kind: "ConditionalExpression", condition: identifier(presence),
        whenTrue: identifier(value.placement.payloadName), whenFalse: clearPayload(placement, input) }),
      assignment(placement.presenceName, identifier(presence)),
    ]);
  }
  const planned = planValue(value, sourceFile, input, diagnostics, planExpression, state);
  if (value.expression !== undefined && planned === undefined)
    failCsharpPlannerInvariant("A private optional write requires its exact source evaluation.", value.expression);
  if (planned?.completion.kind === "never") return planned;
  if (value.kind === "absence") return csharpPlannedEffect(csharpVoidTargetType(), [
    ...planned === undefined ? [] : planCsharpPlannedDiscard(planned),
    assignment(placement.payloadName, clearPayload(placement, input)),
    assignment(placement.presenceName, { kind: "LiteralExpression", value: false }),
  ]);
  if (planned?.completion.kind !== "value")
    failCsharpPlannerInvariant("A private present write requires its native payload value.", value.expression);
  return csharpPlannedEffect(csharpVoidTargetType(), [...planned.prelude,
    assignment(placement.payloadName, planned.completion.expression),
    assignment(placement.presenceName, { kind: "LiteralExpression", value: true }),
  ]);
}

export function planCsharpOptionalLocalDeclaration(operation: Extract<CsharpOptionalLocalOperation, { readonly kind: "declaration" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state: DestructuringPlannerState): readonly CsharpStatement[] {
  const { placement, value } = operation;
  const presenceDeclaration = (expression: CsharpExpression): CsharpStatement => ({ kind: "LocalDeclarationStatement",
    name: placement.presenceName, type: { kind: "PredefinedType", name: "bool" }, initializer: expression });
  const payloadDeclaration = (expression: CsharpExpression): CsharpStatement => ({ kind: "LocalDeclarationStatement",
    name: placement.payloadName, type: payloadType(placement, input), initializer: expression });
  if (value.kind === "copy") return [
    presenceDeclaration(identifier(value.placement.presenceName)),
    payloadDeclaration({ kind: "ConditionalExpression", condition: identifier(placement.presenceName),
      whenTrue: identifier(value.placement.payloadName), whenFalse: clearPayload(placement, input) }),
  ];
  const planned = planValue(value, sourceFile, input, diagnostics, planExpression, state);
  if (value.expression !== undefined && planned === undefined)
    failCsharpPlannerInvariant("A private optional initializer requires its original source evaluation.", value.expression);
  if (planned?.completion.kind === "never") return planned.prelude;
  if (value.kind === "present") {
    if (planned?.completion.kind !== "value")
      failCsharpPlannerInvariant("A private present initializer requires its native payload value.", value.expression);
    return [...planned.prelude, payloadDeclaration(planned.completion.expression),
      presenceDeclaration({ kind: "LiteralExpression", value: true })];
  }
  return [...planned === undefined ? [] : planCsharpPlannedDiscard(planned),
    payloadDeclaration(clearPayload(placement, input)), presenceDeclaration({ kind: "LiteralExpression", value: false })];
}

export function planCsharpOptionalLocal(node: Node, operation: Exclude<CsharpOptionalLocalOperation, { readonly kind: "declaration" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state: DestructuringPlannerState | undefined): CsharpPlannedValue {
  if (state === undefined) failCsharpPlannerInvariant("A private optional local requires its native body scope.", node);
  const { placement } = operation;
  const presence = identifier(placement.presenceName);
  const payload = identifier(placement.payloadName);
  if (operation.kind === "write") return planWrite(placement, operation.value, sourceFile, input, diagnostics, planExpression, state);
  if (operation.kind === "absence-test") {
    const other = planExpression(operation.other, sourceFile, { ...input, storageExpression: operation.other }, diagnostics, state)
      ?? failCsharpPlannerInvariant("A private optional comparison requires its original absence operand.", operation.other);
    if (other.completion.kind === "never") return other;
    const effects = planCsharpPlannedDiscard(other);
    const snapshot = operation.localFirst && effects.length !== 0 ? allocateExpressionTemp(state) : undefined;
    const observed = snapshot === undefined ? presence : identifier(snapshot);
    return csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), operation.negated ? observed
      : { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: observed }, [
      ...snapshot === undefined ? [] : [{ kind: "LocalDeclarationStatement" as const, name: snapshot,
        type: { kind: "PredefinedType" as const, name: "bool" as const }, initializer: presence }],
      ...effects,
    ]);
  }
  if (operation.kind === "read") return csharpPlannedValue(placement.payload, operation.guarded
    ? { kind: "ConditionalExpression", condition: presence, whenTrue: payload,
        whenFalse: { kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
          type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
          arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Optional is absent." } }] } } }
    : payload);
  if (operation.assignment) {
    const written = planWrite(placement, { kind: "present", expression: operation.right }, sourceFile, input, diagnostics, planExpression, state);
    return csharpPlannedEffect(csharpVoidTargetType(), [{ kind: "IfStatement",
      condition: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: presence },
      thenBody: { kind: "Block", statements: written.prelude } }]);
  }
  const right = planExpression(operation.right, sourceFile, { ...input, storageExpression: operation.right }, diagnostics, state)
    ?? failCsharpPlannerInvariant("A private optional coalescing use requires its exact fallback.", operation.right);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics, csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), presence),
    csharpPlannedValue(placement.payload, payload), right, placement.payload)
    ?? failCsharpPlannerInvariant("A private optional coalescing use requires its native branch completion.", node);
}
