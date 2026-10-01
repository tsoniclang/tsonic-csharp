import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTypeofResultsEqual, getCsharpTypeofResult, type CsharpTypeofResult } from "../../../target-model/types/runtime-kind.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./union-access.js";
import { evaluatedConstant } from "./csharp-expression-builders.js";

interface CsharpRuntimeCategoryComparison {
  readonly runtimeKind: CsharpTypeofRuntimeKind;
  readonly negated: boolean;
}

export function planCsharpRuntimeCategory(
  expression: CsharpExpression,
  carrier: TargetTypeRef,
  category: CsharpTypeofResult,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  comparison?: CsharpRuntimeCategoryComparison,
): CsharpExpression | undefined {
  const expected = getCsharpTypeofResult(carrier, undefined, input.program.typeDefinitions);
  if (expected === undefined || !csharpTypeofResultsEqual(expected, category)) return undefined;
  return planRuntimeCategory(expression, category, input, state, comparison);
}

function planRuntimeCategory(
  expression: CsharpExpression,
  category: CsharpTypeofResult,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  comparison: CsharpRuntimeCategoryComparison | undefined,
): CsharpExpression | undefined {
  const literal = (value: CsharpTypeofRuntimeKind): Extract<CsharpExpression, { readonly kind: "LiteralExpression" }> => ({
    kind: "LiteralExpression", value: comparison === undefined ? value : (value === comparison.runtimeKind) !== comparison.negated,
  });
  if (typeof category === "string") return evaluatedConstant(expression, literal(category).value);
  const arms: CsharpSwitchExpressionArm[] = [];
  if (category.kind === "optional") {
    const designation = allocateExpressionTemp(state);
    const type = csharpTypeFromTargetTypeRef(category.element, input.scope.typeParameterNames);
    const nested = typeof category.value === "string" ? literal(category.value)
      : planRuntimeCategory({ kind: "IdentifierName", name: designation }, category.value, input, state, comparison);
    if (type === undefined || nested === undefined) return undefined;
    arms.push({ pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
      expression: literal("object") },
    { pattern: { kind: "DeclarationPattern", type, designation }, expression: nested });
  } else {
    for (const [index, arm] of category.arms.entries()) {
      const designation = allocateExpressionTemp(state);
      const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
      const nested = typeof arm.result === "string" ? literal(arm.result)
        : planRuntimeCategory(runtimeUnionArmProjection(receiver, index, category.sourceCarrier), arm.result, input, state, comparison);
      if (nested === undefined) return undefined;
      arms.push({ pattern: { kind: "VarPattern", designation }, when: runtimeUnionArmTest(receiver, index, category.sourceCarrier),
        expression: nested });
    }
  }
  if (category.kind === "runtime-union") arms.push({ pattern: { kind: "DiscardPattern" }, expression: {
    kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
      type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Invalid native union variant" } }],
    },
  } });
  return { kind: "SwitchExpression", expression, arms };
}
