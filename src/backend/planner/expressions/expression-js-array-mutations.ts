import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import { planTypedArrayMutation } from "./typed-array-mutations.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "./expression-planner-types.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../../../target-model/types/index.js";

export function tryPlanJsArrayMutationExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const selection = input.program.records.jsArrayMutation.get(node);
  if (selection === undefined) {
    failCsharpPlannerInvariant("An admitted array mutation requires its sealed native operation classification.", node);
  }
  if (selection.kind === "not-js-array-mutation") {
    return undefined;
  }
  if (selection.kind === "set-typed-element" || selection.kind === "update-typed-element") {
    return planTypedArrayMutation(node, selection, sourceFile, input, diagnostics,
      planExpression, state);
  }
  if (selection.kind === "rejected") {
    failCsharpPlannerInvariant("An admitted array mutation requires its selected native operation.", node);
  }
  if (selection.kind !== "set-length") {
    return undefined;
  }
  const receiver = planExpression(
    selection.receiver,
    sourceFile,
    input,
    diagnostics,
  );
  const argument = planMutationArgument(
    selection.value,
    sourceFile,
    input,
    diagnostics,
    planCallArgument,
  );
  if (receiver === undefined || argument === undefined) {
    return undefined;
  }
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [receiver, argument], values => ({
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: values[0]!,
      name: selection.targetMemberName,
    },
    arguments: [{ kind: "Argument", expression: values[1]! }],
  }));
}

function planMutationArgument(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
) {
  const targetType = csharpSourcePrimitiveTargetType("float64");
  const argument = planCallArgument(node, sourceFile, input, diagnostics, targetType, "by-value"
  );
  if (argument?.passing !== undefined) {
    failCsharpPlannerInvariant("An admitted JS Array mutation index or length requires its by-value argument.", node);
  }
  return argument;
}
