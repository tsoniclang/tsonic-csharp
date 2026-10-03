import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";
import { planCsharpPresentValueGuard } from "./optional-storage.js";

export interface CsharpPlannedObjectInitializer {
  readonly value: CsharpPlannedValue;
  readonly presence: { readonly kind: "required" } | { readonly kind: "optional"; readonly carrier: TargetTypeRef };
  assignments(value: CsharpExpression): readonly CsharpObjectInitializerAssignment[];
}

export function planCsharpObjectInitialization(
  node: Node, file: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef, type: CsharpTypeNode,
  initial: readonly CsharpObjectInitializerAssignment[], groups: readonly CsharpPlannedObjectInitializer[],
): CsharpPlannedValue | undefined {
  const inline: CsharpObjectInitializerAssignment[] = [...initial];
  let direct = true;
  for (const group of groups) {
    if (group.presence.kind !== "required" || group.value.prelude.length !== 0 ||
      group.value.completion.kind !== "value") { direct = false; break; }
    const assignments = group.assignments(group.value.completion.expression);
    if (assignments.length !== 1) { direct = false; break; }
    inline.push(...assignments);
  }
  if (direct && new Set(inline.map(assignment => assignment.name)).size === inline.length)
    return csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type, assignments: inline });
  const result = captureCsharpPlannedValue(node, input, diagnostics, carrier);
  if (result === undefined) return undefined;
  const reference: CsharpExpression = { kind: "IdentifierName", name: result.name };
  const prelude: CsharpStatement[] = [{ kind: "LocalDeclarationStatement", ...result,
    initializer: { kind: "ObjectCreationExpression", type, assignments: initial } }];
  for (const group of groups) {
    prelude.push(...group.value.prelude);
    if (group.value.completion.kind === "never") return { prelude, completion: group.value.completion };
    if (group.value.completion.kind !== "value") return undefined;
    let value = group.value.completion.expression;
    const selected = group.assignments(value);
    if (selected.length !== 1 || group.presence.kind === "optional") {
      const source = captureCsharpPlannedValue(node, input, diagnostics, group.value.completion.carrier);
      if (source === undefined) return undefined;
      prelude.push({ kind: "LocalDeclarationStatement", ...source, initializer: value });
      value = { kind: "IdentifierName", name: source.name };
    }
    const guard = group.presence.kind !== "optional" ? undefined : planCsharpPresentValueGuard(
      group.value.completion.carrier, group.presence.carrier, value,
      input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}`), input.scope.typeParameterNames,
    );
    if (group.presence.kind === "optional" && guard === undefined) return undefined;
    const stores: CsharpStatement[] = group.assignments(guard?.value ?? value).map(assignment => ({ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", left: { kind: "SimpleMemberAccessExpression", receiver: reference, name: assignment.name },
      operatorToken: { kind: "EqualsToken" }, right: assignment.expression,
    } }));
    if (guard === undefined) prelude.push(...stores);
    else if (stores.length > 0) prelude.push({ kind: "IfStatement", condition: guard.condition,
      thenBody: { kind: "Block", statements: stores } });
  }
  void file;
  return csharpPlannedValue(carrier, reference, prelude);
}
