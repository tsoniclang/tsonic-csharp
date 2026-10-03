import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";

export interface CsharpPlannedObjectInitializer {
  readonly value: CsharpPlannedValue;
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
    if (group.value.prelude.length !== 0 || group.value.completion.kind !== "value") { direct = false; break; }
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
    if (selected.length !== 1) {
      const source = captureCsharpPlannedValue(node, input, diagnostics, group.value.completion.carrier);
      if (source === undefined) return undefined;
      prelude.push({ kind: "LocalDeclarationStatement", ...source, initializer: value });
      value = { kind: "IdentifierName", name: source.name };
    }
    for (const assignment of group.assignments(value)) prelude.push({ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", left: { kind: "SimpleMemberAccessExpression", receiver: reference, name: assignment.name },
      operatorToken: { kind: "EqualsToken" }, right: assignment.expression,
    } });
  }
  void file;
  return csharpPlannedValue(carrier, reference, prelude);
}
