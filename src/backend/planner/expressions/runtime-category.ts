import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTypeofResultsEqual, getCsharpTypeofResult, type CsharpTypeofResult } from "../../../target-model/types/runtime-kind.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./runtime-union-projections.js";
import { evaluatedConstant } from "./csharp-expression-builders.js";

export function planCsharpRuntimeCategory(
  expression: CsharpExpression,
  carrier: TargetTypeRef,
  result: CsharpTypeofResult,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const expected = getCsharpTypeofResult(carrier);
  if (expected === undefined || !csharpTypeofResultsEqual(expected, result)) return undefined;
  return planRuntimeCategory(expression, result, input, state);
}

function planRuntimeCategory(
  expression: CsharpExpression,
  result: CsharpTypeofResult,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (typeof result === "string") return evaluatedConstant(expression, result);
  const arms: CsharpSwitchExpressionArm[] = [];
  if (result.kind === "optional") {
    const designation = allocateExpressionTemp(state);
    const type = csharpTypeFromTargetTypeRef(result.element, input.scope.typeParameterNames);
    const nested = typeof result.value === "string" ? { kind: "LiteralExpression" as const, value: result.value }
      : planRuntimeCategory({ kind: "IdentifierName", name: designation }, result.value, input, state);
    if (type === undefined || nested === undefined) return undefined;
    arms.push({ pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
      expression: { kind: "LiteralExpression", value: "object" } },
    { pattern: { kind: "DeclarationPattern", type, designation }, expression: nested });
  } else {
    for (const [index, arm] of result.arms.entries()) {
      const designation = allocateExpressionTemp(state);
      const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
      const nested = typeof arm.result === "string" ? { kind: "LiteralExpression" as const, value: arm.result }
        : planRuntimeCategory(runtimeUnionArmProjection(receiver, index, result.sourceCarrier), arm.result, input, state);
      if (nested === undefined) return undefined;
      arms.push({ pattern: { kind: "VarPattern", designation }, when: runtimeUnionArmTest(receiver, index, result.sourceCarrier),
        expression: nested });
    }
  }
  if (result.kind === "runtime-union") arms.push({ pattern: { kind: "DiscardPattern" }, expression: {
    kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
      type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Invalid native union variant" } }],
    },
  } });
  return { kind: "SwitchExpression", expression, arms };
}
