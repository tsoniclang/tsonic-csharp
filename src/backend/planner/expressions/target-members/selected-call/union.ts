import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification, ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import { isCsharpVoidTargetType } from "../../../../../target-model/types/identity.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planCsharpGeneratedMethodCall } from "../../../declarations/generated-methods.js";
import { renderCsharpTargetTypeArguments } from "./helpers.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../../union-access.js";
import { csharpSourceArgumentGroups } from "./source-argument-groups.js";

export function planCsharpUnionDispatcherCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  classification: CsharpCallClassification,
  receiver: CsharpExpression,
  arguments_: readonly CsharpArgument[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const union = classification.unionCall;
  if (union.kind !== "resolved") return undefined;
  const methods = input.scope.generatedMethods;
  const receiverType = csharpTypeFromTargetTypeRef(union.receiverType, input.scope.typeParameterNames);
  const resultType = csharpTypeFromTargetTypeRef(union.resultType, input.scope.typeParameterNames);
  const selectedTypeArguments = classification.sourceTypeArguments === undefined ? undefined
    : renderCsharpTargetTypeArguments(input.scope.typeParameterNames, classification.sourceTypeArguments, node, diagnostics);
  const groups = csharpSourceArgumentGroups(source, classification);
  const argumentTypes = groups?.map(group => csharpTypeFromTargetTypeRef(group.type, input.scope.typeParameterNames));
  if (methods === undefined || receiverType === undefined || resultType === undefined ||
    selectedTypeArguments === undefined || argumentTypes === undefined || arguments_.length !== argumentTypes.length || argumentTypes.some(type => type === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A closed union dispatcher requires exact native receiver, argument, result and containing-type contracts."));
    return undefined;
  }
  const forwarded: readonly CsharpArgument[] = argumentTypes.map((_, index) => ({
    kind: "Argument", expression: { kind: "IdentifierName", name: `argument${index}` },
  }));
  const statements: CsharpStatement[] = [];
  for (const [index, method] of union.methods.entries()) {
    const invocation: CsharpExpression = {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: runtimeUnionArmProjection({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType),
        name: method.targetName,
        ...(selectedTypeArguments.length === 0 ? {} : { typeArguments: selectedTypeArguments }),
      },
      arguments: forwarded,
    };
    const branch: readonly CsharpStatement[] = isCsharpVoidTargetType(union.resultType)
      ? [{ kind: "ExpressionStatement", expression: invocation }, { kind: "ReturnStatement" }]
      : [{ kind: "ReturnStatement", expression: invocation }];
    if (index === union.methods.length - 1) statements.push(...branch);
    else statements.push({
      kind: "IfStatement",
      condition: runtimeUnionArmTest({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType),
      thenBody: { kind: "Block", statements: branch },
    });
  }
  return planCsharpGeneratedMethodCall(node, "union_call", resultType,
    [{ name: "receiver", type: receiverType }, ...argumentTypes.map((type, index) => ({ name: `argument${index}`, type: type! }))],
    { kind: "Block", statements }, [{ kind: "Argument", expression: receiver }, ...arguments_], input, diagnostics);
}
