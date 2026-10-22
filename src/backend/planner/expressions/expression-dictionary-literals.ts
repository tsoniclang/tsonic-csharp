import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpArgument, CsharpCollectionInitializerElement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "./planned-value-composition.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { csharpRecordOperation } from "../objects/indexed-records.js";
import { planCsharpExactLiteralRecipe } from "./literal-conversions.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function tryPlanRecordDictionaryLiteralWithCarrier(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, carrier: TargetTypeRef): CsharpPlannedValue | undefined {
  const selected = input.program.records.dictionaryLiteral.get(node, carrier);
  if (selected === undefined) return undefined;
  const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted native dictionary requires its exact constructible type.", node);
  if (selected.parts.length === 0) return csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type, arguments: [] });
  let inline: { readonly arguments: readonly CsharpArgument[]; readonly entries: readonly CsharpCollectionInitializerElement[] } | undefined =
    { arguments: [], entries: [] };
  let result: CsharpPlannedValue = csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type, collectionInitializers: [] });
  for (const part of selected.parts) {
    if (part.kind === "spread") {
      const spread = planExpression(part.expression, sourceFile, input, diagnostics)
        ?? failCsharpPlannerInvariant("An admitted dictionary spread requires its native operand.", part.property);
      if (part.copy) {
        result = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, spread, expression => ({
          kind: "ObjectCreationExpression", type, arguments: [{ kind: "Argument", expression }],
        }), carrier) ?? failCsharpPlannerInvariant("An admitted dictionary copy requires its exact native construction.", part.property);
        inline = spread.completion.kind === "value" ? { arguments: [{ kind: "Argument", expression: spread.completion.expression }], entries: [] } : undefined;
      } else {
        result = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [result, spread],
          values => csharpRecordOperation("Extend", values), carrier)
          ?? failCsharpPlannerInvariant("An admitted dictionary spread requires its ordered native merge.", part.property);
        inline = undefined;
      }
      continue;
    }
    const key = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, part.key);
    if (key.kind !== "resolved") failCsharpPlannerInvariant("An admitted dictionary key requires its exact native literal.", part.property);
    const value = planExpression(part.value, sourceFile, input, diagnostics)
      ?? failCsharpPlannerInvariant("An admitted dictionary initializer requires its native value.", part.property);
    if (inline !== undefined && value.prelude.length === 0 && value.completion.kind === "value") {
      inline = { ...inline, entries: [...inline.entries, { kind: "IndexerInitializer", arguments: [key.expression], expression: value.completion.expression }] };
      result = csharpPlannedValue(carrier, { kind: "ObjectCreationExpression", type, arguments: inline.arguments,
        collectionInitializers: inline.entries }, result.prelude);
    } else {
      result = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [result, value],
        values => csharpRecordOperation("Set", [values[0]!, key.expression, values[1]!]), carrier)
        ?? failCsharpPlannerInvariant("An admitted dictionary initializer requires its ordered native write.", part.property);
      inline = undefined;
    }
  }
  return result;
}
