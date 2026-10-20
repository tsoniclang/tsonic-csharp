import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planCsharpGeneratedMethodCall } from "../../../declarations/generated-methods.js";
import { renderCsharpTargetTypeArguments } from "./helpers.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../../union-access.js";

export function planCsharpUnionDispatcherCall(
  node: Node,
  receiver: CsharpExpression,
  arguments_: readonly CsharpArgument[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selected = input.program.records.sourceCallEmission.get(node);
  if (selected?.kind !== "union") failCsharpPlannerInvariant("An admitted union dispatcher requires its exact native call plan.", node);
  const union = selected.union;
  const methods = input.scope.generatedMethods;
  const receiverType = csharpTypeFromTargetTypeRef(union.receiverType, input.scope.typeParameterNames);
  const resultType = csharpTypeFromTargetTypeRef(union.resultType, input.scope.typeParameterNames);
  const selectedTypeArguments = renderCsharpTargetTypeArguments(input.scope.typeParameterNames, selected.typeArguments, node, diagnostics);
  const argumentTypes = selected.parameters.map(type => csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames));
  if (methods === undefined || receiverType === undefined || resultType === undefined ||
    selectedTypeArguments === undefined || argumentTypes === undefined || arguments_.length !== argumentTypes.length || argumentTypes.some(type => type === undefined)) {
    failCsharpPlannerInvariant("An admitted union dispatcher requires its exact native receiver, argument, result and containing-type contracts.", node);
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
        receiver: runtimeUnionArmProjection({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType, false, input),
        name: method.targetName,
        ...(selectedTypeArguments.length === 0 ? {} : { typeArguments: selectedTypeArguments }),
      },
      arguments: forwarded,
    };
    const branch: readonly CsharpStatement[] = selected.void
      ? [{ kind: "ExpressionStatement", expression: invocation }, { kind: "ReturnStatement" }]
      : [{ kind: "ReturnStatement", expression: invocation }];
    if (index === union.methods.length - 1) statements.push(...branch);
    else statements.push({
      kind: "IfStatement",
      condition: runtimeUnionArmTest({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType, input),
      thenBody: { kind: "Block", statements: branch },
    });
  }
  return planCsharpGeneratedMethodCall(node, "union_call", resultType,
    [{ name: "receiver", type: receiverType }, ...argumentTypes.map((type, index) => ({ name: `argument${index}`, type: type! }))],
    { kind: "Block", statements }, [{ kind: "Argument", expression: receiver }, ...arguments_], input, diagnostics);
}
