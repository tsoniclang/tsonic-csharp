import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpUnionProperty } from "../../../policy/operations/union-properties.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpNativeUnionProjection } from "./union-projections.js";

export function planCsharpUnionProperty(
  node: Node,
  fact: CsharpUnionProperty,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const receiver = planExpression(fact.source.receiver.expression, sourceFile, input, diagnostics);
  if (receiver === undefined) return undefined;
  return planCsharpNativeUnionProjection(node, receiver, fact, input, diagnostics, variant => variant.operation,
    (payload, operation, index) => {
      const member = operation.targetMember;
      if (operation.receiver.kind !== "instance" || operation.invocation.kind !== "member" || member.static === true ||
        !["property", "field"].includes(member.kind) || member.declaringType === undefined || member.returnType === undefined ||
        !targetTypeRefEquals(member.declaringType, fact.variants[index]!.carrier) ||
        !targetTypeRefEquals(member.returnType, fact.resultCarrier)) {
        diagnostics.push(targetPolicyDiagnostic(node, "CSHARP_UNION_PROPERTY_ARM_INVALID",
          "Native union property arm conflicts with its exact receiver or result contract."));
        return undefined;
      }
      return { kind: "SimpleMemberAccessExpression", receiver: payload, name: member.targetName };
    });
}
