import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";
import { planCsharpAbsentValue, planCsharpPresentValueGuard } from "./optional-storage.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import type { CsharpObjectInitialization } from "../../../target-model/records/object-literals.js";

export interface CsharpPlannedObjectAssignment extends CsharpObjectInitializerAssignment {
  readonly carrier: TargetTypeRef;
}

export interface CsharpPlannedObjectInitializer {
  readonly value: CsharpPlannedValue;
  readonly presence: { readonly kind: "required" } | { readonly kind: "optional"; readonly carrier: TargetTypeRef };
  assignments(value: CsharpExpression): readonly CsharpPlannedObjectAssignment[];
}

export function planCsharpObjectInitialization(
  node: Node, file: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef, type: CsharpTypeNode,
  initialization: CsharpObjectInitialization,
  initial: readonly CsharpPlannedObjectAssignment[], groups: readonly CsharpPlannedObjectInitializer[],
): CsharpPlannedValue | undefined {
  const inline: CsharpObjectInitializerAssignment[] = initial.map(({ name, expression }) => ({ kind: "AssignmentExpression", name, expression }));
  let direct = true;
  for (const group of groups) {
    if (group.presence.kind !== "required" || group.value.prelude.length !== 0 ||
      group.value.completion.kind !== "value") { direct = false; break; }
    const assignments = group.assignments(group.value.completion.expression);
    if (assignments.length !== 1) { direct = false; break; }
    inline.push(...assignments.map(({ name, expression }) => ({ kind: "AssignmentExpression" as const, name, expression })));
  }
  if (direct && initialization.inlineUnique)
    return csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type, assignments: inline });
  const prelude: CsharpStatement[] = [];
  const slots = new Map<string, { readonly name: string }>();
  const selectedSlots = new Map(initialization.slots.map(slot => [slot.name, slot]));
  const append = (assignment: CsharpPlannedObjectAssignment, optional: boolean): readonly CsharpStatement[] | undefined => {
    let slot = slots.get(assignment.name);
    if (slot === undefined) {
      const selected = selectedSlots.get(assignment.name)
        ?? failCsharpPlannerInvariant("An admitted object initialization requires its selected native storage slot.", node);
      const captured = captureCsharpPlannedValue(node, input, assignment.carrier);
      if (captured === undefined) return undefined;
      const absent = selected.initializeAbsence ? planCsharpAbsentValue(selected.carrier, input) : undefined;
      if (selected.initializeAbsence && absent === undefined) failCsharpPlannerInvariant("An admitted optional object slot requires its native absence initializer.", node);
      slot = { name: captured.name };
      slots.set(assignment.name, slot);
      const declaration: CsharpStatement = { kind: "LocalDeclarationStatement", ...captured,
        ...(!optional ? { initializer: assignment.expression } : absent === undefined ? {} : { initializer: absent }) };
      if (!optional) return [declaration];
      prelude.push(declaration);
    }
    return [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name: slot.name }, operatorToken: { kind: "EqualsToken" }, right: assignment.expression } }];
  };
  for (const assignment of initial) {
    const stored = append(assignment, false);
    if (stored === undefined) return undefined;
    prelude.push(...stored);
  }
  for (const group of groups) {
    prelude.push(...group.value.prelude);
    if (group.value.completion.kind === "never") return { prelude, completion: group.value.completion };
    if (group.value.completion.kind !== "value") return undefined;
    let value = group.value.completion.expression;
    const selected = group.assignments(value);
    if (selected.length !== 1 || group.presence.kind === "optional") {
      const source = captureCsharpPlannedValue(node, input, group.value.completion.carrier);
      if (source === undefined) return undefined;
      prelude.push({ kind: "LocalDeclarationStatement", ...source, initializer: value });
      value = { kind: "IdentifierName", name: source.name };
    }
    const guard = group.presence.kind !== "optional" ? undefined : planCsharpPresentValueGuard(
      group.value.completion.carrier, group.presence.carrier, value,
      input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}`), input,
    );
    if (group.presence.kind === "optional" && guard === undefined) return undefined;
    const stores: CsharpStatement[] = [];
    for (const assignment of group.assignments(guard?.value ?? value)) {
      const stored = append(assignment, guard !== undefined);
      if (stored === undefined) return undefined;
      stores.push(...stored);
    }
    if (guard === undefined) prelude.push(...stores);
    else if (stores.length > 0) prelude.push({ kind: "IfStatement", condition: guard.condition,
      thenBody: { kind: "Block", statements: stores } });
  }
  void file;
  return csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type,
    assignments: [...slots].map(([name, slot]) => ({ kind: "AssignmentExpression", name,
      expression: { kind: "IdentifierName", name: slot.name } })) }, prelude);
}
