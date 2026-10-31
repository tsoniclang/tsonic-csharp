import type { CsharpClosedTypeTest } from "../../../target-model/operations/type-tests.js";
import type { CsharpClosedTypeTestEmission } from "../../../target-model/records/types/type-tests.js";
import type { CsharpExpression, CsharpStatement, CsharpSwitchExpressionArm } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { qualifiedCsharpType } from "../types/index.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./union-access.js";
import { evaluatedConstant } from "./builders.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpClosedTypeTest(expression: CsharpExpression, fact: CsharpClosedTypeTest,
  input: CsharpPlanningContext, state: DestructuringPlannerState, prelude: CsharpStatement[], evaluation: "evaluate" | "omit"): CsharpExpression {
  const selected = input.program.records.closedTypeTestEmission.get(fact)
    ?? failCsharpPlannerInvariant("An admitted type predicate requires its native emission plan.");
  return selected.kind === "constant" ? evaluatedConstant(expression, fact.sourceCarrier, selected.value, prelude, evaluation)
    : planTest(expression, selected, input, state);
}

function planTest(expression: CsharpExpression, test: CsharpClosedTypeTestEmission,
  input: CsharpPlanningContext, state: DestructuringPlannerState): CsharpExpression {
  if (test.kind === "constant") return { kind: "LiteralExpression", value: test.value };
  if (test.kind === "runtime-array") return test.dispatch === "instance" ? { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "IsArray" }, arguments: [] }
    : { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "JSArrayStatics"), name: "isArray" }, arguments: [{ kind: "Argument", expression }] };
  if (test.kind === "native" || test.kind === "js-value") {
    const target = csharpTypeFromTargetTypeRef(test.target, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted type predicate requires its native target syntax.");
    if (test.kind === "native") return { kind: "IsPatternExpression", expression: { kind: "CastExpression",
      type: { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } }, expression }, type: target };
    const runtime = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted closed type test requires its native runtime owner.");
    return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: runtime, name: "IsDynamicInstanceOf", typeArguments: [target] },
      arguments: [{ kind: "Argument", expression }] };
  }
  const arms: CsharpSwitchExpressionArm[] = [];
  if (test.kind === "optional") {
    const designation = allocateExpressionTemp(state);
    const type = csharpTypeFromTargetTypeRef(test.element, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted optional type test requires its native payload type.");
    arms.push({ pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } }, expression: { kind: "LiteralExpression", value: false } },
      { pattern: { kind: "DeclarationPattern", type, designation }, expression: planTest({ kind: "IdentifierName", name: designation }, test.test, input, state) });
  } else {
    for (const [index, arm] of test.arms.entries()) {
      const designation = allocateExpressionTemp(state);
      const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
      const value = arm.kind === "constant" ? { kind: "LiteralExpression" as const, value: arm.value }
        : planTest(runtimeUnionArmProjection(receiver, index, test.carrier, false, input), arm, input, state);
      arms.push({ pattern: { kind: "VarPattern", designation }, when: runtimeUnionArmTest(receiver, index, test.carrier, input), expression: value });
    }
    arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "LiteralExpression", value: false } });
  }
  return { kind: "SwitchExpression", expression, arms };
}
