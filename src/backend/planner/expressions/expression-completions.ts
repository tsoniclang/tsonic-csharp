import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../planning-data.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { qualifiedCsharpType } from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpNeverValue } from "./never-values.js";
import { csharpPlannedValue, csharpPlannedEffect, type CsharpPlannedValue } from "./planned-values.js";

export function planCsharpExpressionCompletion(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  expression: CsharpExpression | undefined,
  carrier: TargetTypeRef | undefined,
  prelude: readonly CsharpStatement[] = [],
): CsharpPlannedValue | undefined {
  if (expression === undefined) return undefined;
  if (carrier === undefined) failCsharpPlannerInvariant("An admitted expression requires its finalized completion carrier.", node);
  const completion = input.program.records.typeEmission.get(carrier)?.completion
    ?? failCsharpPlannerInvariant("An admitted expression requires its selected native completion.", node);
  if (completion === "never") return csharpPlannedEffect(carrier, [...prelude, {
    kind: "ThrowStatement", expression: planCsharpNeverValue(expression, qualifiedCsharpType("System", "Exception")),
  }], "never");
  if (completion === "void") {
    let statement = expression;
    while (statement.kind === "ParenthesizedExpression") statement = statement.expression;
    return { ...csharpPlannedEffect(carrier, [...prelude, { kind: "ExpressionStatement", expression: statement }]),
      ...(prelude.length === 0 ? { effect: statement } : {}) };
  }
  return csharpPlannedValue(carrier, expression, prelude, input.program.records.nativeConstant.get(node, carrier) === true,
    input.program.records.nativeAbsence.get(node, carrier) === true);
}
