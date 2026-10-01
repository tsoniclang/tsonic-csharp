import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";
import { planCsharpUnionPattern } from "./union-patterns.js";

export function planCsharpNativeUnionProjection<Variant extends { readonly carrier: TargetTypeRef }, Selection>(
  node: Node,
  expression: CsharpExpression,
  fact: { readonly unionCarrier: TargetTypeRef; readonly selectedVariantIndexes: readonly number[];
    readonly variants: readonly Variant[] },
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  selectionFor: (variant: Variant) => Selection | undefined,
  project: (payload: CsharpExpression, selection: Selection, index: number) => CsharpExpression | undefined,
): CsharpExpression | undefined {
  const reject = (message: string): undefined => {
    diagnostics.push(targetPolicyDiagnostic(node, "CSHARP_UNION_PROJECTION_CONTRACT_INVALID", message));
    return undefined;
  };
  if (!Array.isArray(fact.variants) || !Array.isArray(fact.selectedVariantIndexes)) {
    return reject("Native union projection requires dense variant and selection rows.");
  }
  const variants = getCsharpRuntimeUnionArms(fact.unionCarrier, input.program.typeDefinitions);
  const selected = new Set(fact.selectedVariantIndexes);
  if (variants === undefined || variants.length !== fact.variants.length || selected.size === 0 ||
    selected.size !== fact.selectedVariantIndexes.length || [...fact.selectedVariantIndexes].some(index =>
      !Number.isInteger(index) || index < 0 || index >= fact.variants.length)) {
    return reject("Native union projection has no exact emitted shape and nonempty selected-variant set.");
  }
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const [index, variant] of fact.variants.entries()) {
    if (variant === undefined || variant === null || variant.carrier === undefined) {
      return reject("Native union projection contains an absent variant carrier.");
    }
    const selection = selectionFor(variant);
    if (variants[index] === undefined || !targetTypeRefEquals(variant.carrier, variants[index]!) ||
      selected.has(index) !== (selection !== undefined)) {
      return reject("Native union projection conflicts with its finalized variant contract.");
    }
    if (selection === undefined) continue;
    const designation = input.names.temporaryName(`__tsonic_union_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}_${index}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const projected = planCsharpUnionPattern(receiver, [{ union: fact.unionCarrier, index }], fact.unionCarrier);
    const value = project(projected.value, selection, index);
    if (value === undefined) return undefined;
    arms.push({ pattern: { kind: "VarPattern", designation }, when: projected.condition, expression: value });
  }
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: {
    kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native union variant" } }],
  } } });
  return { kind: "SwitchExpression", expression, arms };
}
