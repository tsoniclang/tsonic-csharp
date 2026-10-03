import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBorrowedSequenceInput } from "../../../../analysis/operations/borrowed-sequences.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { planCsharpSequenceSnapshotStatements } from "../sequence-conversions.js";
import { planCsharpBorrowedSequenceConsumption } from "./borrowed-sequences.js";

export function planCsharpBorrowedDenseSequence(
  node: Node,
  fact: CsharpBorrowedSequenceInput,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const name = input.names.temporaryName("__tsonic_sequence_result");
  const receiver: CsharpExpression = { kind: "IdentifierName", name };
  const destinationType: CsharpTypeNode = { kind: "ArrayType", elementType };
  const resultCarrier: TargetTypeRef = { kind: "array", element: elementTarget };
  const allocate = (size: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement", expression: {
    kind: "AssignmentExpression", left: receiver, operatorToken: { kind: "EqualsToken" },
    right: { kind: "ArrayCreationExpression", elementType, elements: [], size },
  } });
  const planned = planCsharpBorrowedSequenceConsumption(node, fact, sourceFile, input, diagnostics, elementTarget,
    expression => planExpression(expression, sourceFile, input, diagnostics), source =>
      planCsharpSequenceSnapshotStatements(node, source, receiver, sourceFile, input, diagnostics, elementType, elementTarget),
    () => [allocate({ kind: "LiteralExpression", value: 0 })]);
  if (planned === undefined || planned.completion.kind === "never") return planned;
  return csharpPlannedValue(resultCarrier, receiver, [
    { kind: "LocalDeclarationStatement", name, type: destinationType }, ...planned.prelude,
  ]);
}
