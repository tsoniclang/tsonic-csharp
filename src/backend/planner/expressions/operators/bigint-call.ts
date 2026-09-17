import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { callStatic } from "../csharp-expression-builders.js";

export function planCsharpBigIntCall(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpExpression | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "bigint-call") return undefined;
  let storage = selection.left;
  while (input.program.source.ast.is.IsParenthesizedExpression(storage)) {
    const nested = input.program.source.ast.as.AsParenthesizedExpression(storage)?.Expression;
    if (nested === undefined) return undefined;
    storage = nested;
  }
  const left = planExpression(storage, sourceFile, operation.assignment ? { ...input, storageExpression: storage } : input, diagnostics);
  const right = planExpression(selection.right, sourceFile, input, diagnostics);
  if (left === undefined || right === undefined) return undefined;
  const calculate = (value: CsharpExpression): CsharpExpression => callStatic(
    { kind: "IdentifierName", requiredUsingNamespace: "Tsonic.CSharp.Runtime", name: "BigIntOperators" }, operation.method, [value, right]);
  if (!operation.assignment) return calculate(left);
  const assign = (location: CsharpExpression): CsharpExpression => ({
    kind: "AssignmentExpression", left: location, operatorToken: { kind: "EqualsToken" }, right: calculate(location),
  });
  if (operation.location === "direct") return assign(left);
  if (operation.location !== "reference-receiver" || state === undefined ||
    (left.kind !== "SimpleMemberAccessExpression" && left.kind !== "ElementAccessExpression")) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "BigInt compound assignment requires a binding or an exact reference-receiver location and hygienic evaluation scope."));
    return undefined;
  }
  const name = allocateExpressionTemp(state);
  const reference: CsharpExpression = { kind: "IdentifierName", name };
  const inputs = left.kind === "ElementAccessExpression" ? [left.receiver, ...left.arguments] : [left.receiver];
  const receiver: CsharpExpression = inputs.length === 1 ? reference : {
    kind: "SimpleMemberAccessExpression", receiver: reference, name: "Item1",
  };
  const location: CsharpExpression = left.kind === "SimpleMemberAccessExpression"
    ? { ...left, receiver }
    : { ...left, receiver, arguments: left.arguments.map((_, index) => ({
      kind: "SimpleMemberAccessExpression", receiver: reference, name: `Item${index + 2}`,
    })) };
  return {
    kind: "ConditionalExpression",
    condition: { kind: "IsPatternExpression", expression: inputs.length === 1 ? inputs[0]! : { kind: "TupleExpression", elements: inputs },
      type: { kind: "IdentifierName", name: "var" }, designation: name },
    whenTrue: assign(location),
    whenFalse: { kind: "DefaultExpression", type: { kind: "IdentifierName", requiredUsingNamespace: "System.Numerics", name: "BigInteger" } },
  };
}
