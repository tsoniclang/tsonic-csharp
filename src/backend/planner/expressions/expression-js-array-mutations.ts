import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  selectCsharpJsArrayMutation,
} from "../../../policy/operations/index.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../../../policy/types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

export function tryPlanJsArrayDeleteExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const selection = selectCsharpJsArrayMutation(input.policy, node, sourceFile);
  if (selection.kind !== "delete-element") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      selection.kind === "rejected"
        ? selection.reason
        : "C# delete requires an exact target mutation policy.",
    ));
    return undefined;
  }
  const receiver = planExpression(
    selection.receiver,
    sourceFile,
    input,
    diagnostics,
  );
  const argument = planMutationArgument(
    selection.index,
    sourceFile,
    input,
    diagnostics,
    planCallArgument,
  );
  if (receiver === undefined || argument === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: selection.targetMemberName,
    },
    arguments: [argument],
  };
}

export function tryPlanJsArrayLengthMutationExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const selection = selectCsharpJsArrayMutation(input.policy, node, sourceFile);
  if (selection.kind === "not-js-array-mutation") {
    return undefined;
  }
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
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
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: selection.targetMemberName,
    },
    arguments: [argument],
  };
}

function planMutationArgument(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
) {
  const targetType = csharpSourcePrimitiveTargetType("int32");
  const expectedType = csharpTypeFromTargetTypeRef(targetType);
  if (expectedType === undefined) {
    throw new Error("The C# int32 mutation parameter must always be renderable.");
  }
  const argument = planCallArgument(
    node,
    sourceFile,
    input,
    diagnostics,
    expectedType,
    undefined,
    targetType,
    "by-value",
  );
  if (argument?.passing !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# JS Array mutation indexes and lengths require by-value arguments.",
    ));
    return undefined;
  }
  return argument;
}
