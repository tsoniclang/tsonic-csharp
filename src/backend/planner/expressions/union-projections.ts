import type { Node } from "@tsonic/tsts";
import type { CsharpUnionPropertyProjection } from "../../../target-model/records/property-admission.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { planCsharpUnionPattern } from "./union-patterns.js";

export function planCsharpNativeUnionPropertyProjection(node: Node, expression: CsharpExpression,
  fact: CsharpUnionPropertyProjection, input: CsharpPlanningContext): CsharpExpression {
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const variant of fact.variants) {
    const { index } = variant;
    const designation = input.names.temporaryName(`__tsonic_union_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}_${index}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const projected = planCsharpUnionPattern(receiver, [{ union: fact.unionCarrier, index }], fact.unionCarrier, false, input);
    const value: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: projected.value, name: variant.memberName };
    arms.push({ pattern: { kind: "VarPattern", designation }, when: projected.condition, expression: value });
  }
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: {
    kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native union variant" } }],
  } } });
  return { kind: "SwitchExpression", expression, arms };
}
