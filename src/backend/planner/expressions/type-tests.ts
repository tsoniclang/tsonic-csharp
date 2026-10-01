import type { CsharpClosedTypeTest, CsharpClosedTypeTestPlan } from "../../../target-model/operations/type-tests.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpSwitchExpressionArm, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import { allocateExpressionTemp } from "../bindings/binding-state.js";
import { csharpClosedTypeTestMatches } from "../../../analysis/operations/type-tests.js";
import { csharpTsValueTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { qualifiedCsharpType } from "../types/index.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./union-access.js";
import { evaluatedConstant } from "./csharp-expression-builders.js";

export function planCsharpClosedTypeTest(
  expression: CsharpExpression,
  fact: CsharpClosedTypeTest,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (!csharpClosedTypeTestMatches(fact, input.program.typeDefinitions)) return undefined;
  const target = fact.predicate.kind === "array" ? undefined
    : csharpTypeFromTargetTypeRef(fact.predicate.targetCarrier, input.scope.typeParameterNames);
  if (fact.predicate.kind === "nominal" && target === undefined) return undefined;
  return planTest(expression, fact.sourceCarrier, fact.test, target, input, state);
}

function planTest(
  expression: CsharpExpression,
  carrier: TargetTypeRef,
  test: CsharpClosedTypeTestPlan,
  target: CsharpTypeNode | undefined,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (test.kind === "constant") return evaluatedConstant(expression, test.value);
  if (test.kind === "runtime-array" && isCsharpJsValueTargetType(carrier)) return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "IsArray" }, arguments: [] };
  if (test.kind === "runtime-array") return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression", receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "JSArrayStatics"), name: "isArray",
  }, arguments: [{ kind: "Argument", expression }] };
  if ((test.kind === "native" || test.kind === "js-value") && target === undefined) return undefined;
  if (test.kind === "native") return { kind: "IsPatternExpression",
    expression: { kind: "CastExpression", type: { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } }, expression },
    type: target! };
  if (test.kind === "js-value") {
    const runtime = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), input.scope.typeParameterNames);
    return runtime === undefined ? undefined : { kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: runtime, name: "IsDynamicInstanceOf", typeArguments: [target!],
    }, arguments: [{ kind: "Argument", expression }] };
  }
  const arms: CsharpSwitchExpressionArm[] = [];
  if (test.kind === "optional") {
    const designation = allocateExpressionTemp(state);
    const type = csharpTypeFromTargetTypeRef(test.element, input.scope.typeParameterNames);
    const value = planTest({ kind: "IdentifierName", name: designation }, test.element, test.test, target, input, state);
    if (type === undefined || value === undefined) return undefined;
    arms.push({ pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
      expression: { kind: "LiteralExpression", value: false } },
    { pattern: { kind: "DeclarationPattern", type, designation }, expression: value });
  } else {
    for (const [index, arm] of test.arms.entries()) {
      const designation = allocateExpressionTemp(state);
      const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
      const value = arm.test.kind === "constant" ? { kind: "LiteralExpression" as const, value: arm.test.value }
        : planTest(runtimeUnionArmProjection(receiver, index, carrier), arm.carrier, arm.test, target, input, state);
      if (value === undefined) return undefined;
      arms.push({ pattern: { kind: "VarPattern", designation }, when: runtimeUnionArmTest(receiver, index, carrier), expression: value });
    }
    arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "LiteralExpression", value: false } });
  }
  return { kind: "SwitchExpression", expression, arms };
}
