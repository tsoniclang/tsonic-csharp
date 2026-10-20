import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { planCsharpUnionPattern } from "./union-patterns.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planCsharpNativeUnionProjection<Variant extends { readonly carrier: TargetTypeRef }, Selection>(
  node: Node, expression: CsharpExpression,
  fact: { readonly unionCarrier: TargetTypeRef; readonly selectedVariantIndexes: readonly number[]; readonly variants: readonly Variant[] },
  input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[], selectionFor: (variant: Variant) => Selection | undefined,
  project: (payload: CsharpExpression, selection: Selection, index: number) => CsharpExpression | undefined): CsharpExpression {
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const index of fact.selectedVariantIndexes) {
    const variant = fact.variants[index]
      ?? failCsharpPlannerInvariant("An admitted union projection requires its selected native variant.", node);
    const selection = selectionFor(variant)
      ?? failCsharpPlannerInvariant("An admitted union projection requires its selected arm operation.", node);
    const designation = input.names.temporaryName(`__tsonic_union_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}_${index}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const projected = planCsharpUnionPattern(receiver, [{ union: fact.unionCarrier, index }], fact.unionCarrier, false, input);
    const value = project(projected.value, selection, index)
      ?? failCsharpPlannerInvariant("An admitted union arm requires its native projection.", node);
    arms.push({ pattern: { kind: "VarPattern", designation }, when: projected.condition, expression: value });
  }
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: {
    kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native union variant" } }],
  } } });
  return { kind: "SwitchExpression", expression, arms };
}
