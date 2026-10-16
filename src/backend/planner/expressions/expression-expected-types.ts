import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeUse } from "../../../target-model/records/native-demand.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import type { ExpressionPlanner, ExpectedExpressionPlanner } from "./expression-planner-types.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planArrayLiteralExpressionWithCarrier } from "./array-literals/index.js";
import { planObjectLiteralExpressionWithExpectedType } from "../objects/object-literals/planning.js";
import { tryPlanRecordDictionaryLiteralWithExpectedType } from "./expression-dictionary-literals.js";
import { planSelectedCsharpBinaryOperation } from "./operators/selected-binary.js";
import { planCsharpConditionExpression } from "./expression-bool-carriers.js";
import { planCsharpExactLiteralRecipe } from "./literal-conversions.js";
import { planVoidExpression } from "./expression-void.js";
import { planCsharpAbsentValue } from "./optional-storage.js";
import { csharpPlannedEffect, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion, planCsharpValueBranch } from "./planned-value-composition.js";
import { applyCsharpConversionSelection, readCsharpExpressionConversionClassification } from "./conversions.js";
import { requireCsharpNativeExpressionUse } from "./native-uses.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";

export interface CsharpNativeExpressionPlanners {
  readonly planSourceExpression: ExpressionPlanner;
  readonly planExpression: ExpressionPlanner;
  readonly planExpressionWithExpectedType: ExpectedExpressionPlanner;
}

export function planCsharpNativeExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planners: CsharpNativeExpressionPlanners,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const selected = requireCsharpNativeExpressionUse(input, node).use;
  if (selected.kind === "erased") return csharpPlannedEffect(csharpVoidTargetType(), []);
  const construction = selected.kind === "converted" && selected.children.length === 1 &&
      selected.children[0]!.subject === node && selected.children[0]!.role === "constructed-result"
    ? input.program.records.nativeUse.get(selected.children[0]!) ?? failCsharpPlannerInvariant(
      "A native conversion requires its admitted physical construction stage.", node) : undefined;
  const physical = construction ?? selected;
  if (physical.kind === "erased") return failCsharpPlannerInvariant("Native construction cannot be erased.", node);
  const planned = render(physical);
  if (planned === undefined || planned.completion.kind === "never" || selected.kind !== "converted") return planned;
  const conversion = readCsharpExpressionConversionClassification(node, input, diagnostics,
    selected.carrier, selected.target, selected.mode);
  if (conversion === undefined) return undefined;
  if (planned.completion.kind === "void" && conversion.kind === "absence") {
    const absent = planCsharpAbsentValue(selected.target, input.scope.typeParameterNames);
    return absent === undefined ? failCsharpPlannerInvariant("Admitted native absence must be renderable.", node)
      : { prelude: planned.prelude, completion: { kind: "value", carrier: selected.target, expression: absent } };
  }
  return mapCsharpPlannedValue(planned, selected.target, expression => applyCsharpConversionSelection(
    node, sourceFile, input, diagnostics, selected.carrier, selected.target, conversion, expression));

  function render(use: Exclude<CsharpNativeUse, { readonly kind: "erased" }>): CsharpPlannedValue | undefined {
    const complete = (expression: Parameters<typeof planCsharpExpressionCompletion>[4]) =>
      planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression, use.carrier);
    if (use.completion.kind === "never" && use.evaluation.kind === "sequence") {
      const stop = use.evaluation.steps.findIndex(step => step.guard === undefined &&
        input.program.records.nativeUse.get(step.site)?.kind !== "erased" &&
        nativeUse(step.site).completion.kind === "never");
      if (stop >= 0) {
        const prelude: CsharpStatement[] = [];
        for (const step of use.evaluation.steps.slice(0, stop)) {
          const discarded = discardUse(step.site);
          if (discarded === undefined) return undefined;
          prelude.push(...discarded);
        }
        const last = nativeUse(use.evaluation.steps[stop]!.site);
        const value = planners.planExpression(last.expression, sourceFile, input, diagnostics, state);
        return value === undefined ? undefined : { prelude: [...prelude, ...value.prelude], completion: value.completion };
      }
    }
    if (use.literal !== undefined) {
      const literal = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, use.literal);
      return literal.kind === "resolved" ? complete(literal.expression)
        : failCsharpPlannerInvariant("An admitted native literal requires its renderable exact recipe.", node);
    }
    if (use.binary !== undefined) return planSelectedCsharpBinaryOperation(node, use.binary, sourceFile, input,
      diagnostics, planners.planExpression, planners.planExpressionWithExpectedType, state);
    const ast = input.program.source.ast;
    if (ast.is.IsVoidExpression(node)) return planVoidExpression(node, sourceFile, input, diagnostics,
      planners.planExpression, use.carrier);
    if (ast.is.IsAsExpression(node) || ast.is.IsTypeAssertion(node) || ast.is.IsNonNullExpression(node) ||
      ast.is.IsParenthesizedExpression(node) || ast.is.IsSatisfiesExpression(node)) {
      const inner = ast.is.IsParenthesizedExpression(node) ? ast.as.AsParenthesizedExpression(node)?.Expression
        : ast.is.IsSatisfiesExpression(node) ? ast.as.AsSatisfiesExpression(node)?.Expression
        : ast.is.IsNonNullExpression(node) ? ast.as.AsNonNullExpression(node)?.Expression
        : ast.is.IsAsExpression(node) ? ast.as.AsAsExpression(node)?.Expression : ast.as.AsTypeAssertion(node)?.Expression;
      if (inner === undefined) return failCsharpPlannerInvariant("A native forwarded expression requires its operand.", node);
      const value = planners.planExpression(inner, sourceFile, input, diagnostics, state);
      return ast.is.IsParenthesizedExpression(node) ? mapCsharpPlannedValue(value, use.carrier,
        expression => ({ kind: "ParenthesizedExpression", expression })) : value;
    }
    if (ast.is.IsConditionalExpression(node)) {
      const conditional = ast.as.AsConditionalExpression(node);
      if (conditional?.Condition === undefined || conditional.WhenTrue === undefined || conditional.WhenFalse === undefined) {
        return failCsharpPlannerInvariant("A native conditional requires its admitted condition and branches.", node);
      }
      return planCsharpValueBranch(node, sourceFile, input, diagnostics,
        planCsharpConditionExpression(conditional.Condition, "Conditional expression condition", sourceFile, input,
          diagnostics, planners.planExpression),
        planners.planExpression(conditional.WhenTrue, sourceFile, input, diagnostics, state),
        planners.planExpression(conditional.WhenFalse, sourceFile, input, diagnostics, state), use.carrier);
    }
    if (ast.is.IsArrayLiteralExpression(node)) return planArrayLiteralExpressionWithCarrier(
      node, sourceFile, input, diagnostics, use.carrier, planners);
    if (ast.is.IsObjectLiteralExpression(node)) {
      const type = csharpTypeFromTargetTypeRef(use.carrier, input.scope.typeParameterNames);
      if (type === undefined) return failCsharpPlannerInvariant("A native object construction requires a renderable carrier.", node);
      const dictionary = tryPlanRecordDictionaryLiteralWithExpectedType(node, sourceFile, input, diagnostics,
        undefined, planners.planExpressionWithExpectedType, use.carrier);
      return dictionary ?? planObjectLiteralExpressionWithExpectedType(node, sourceFile, input, diagnostics, type,
        undefined, planners.planExpression, planners.planExpressionWithExpectedType, use.carrier, state);
    }
    return planners.planSourceExpression(node, sourceFile, input, diagnostics, state);
  }

  function nativeUse(site: TargetUseSiteRef): Exclude<CsharpNativeUse, { readonly kind: "erased" }> {
    const use = input.program.records.nativeUse.get(site);
    return use === undefined || use.kind === "erased" ? failCsharpPlannerInvariant(
      "Native ordered evaluation requires its admitted child completion.", node) : use;
  }

  function discardUse(site: TargetUseSiteRef): readonly CsharpStatement[] | undefined {
    const use = nativeUse(site);
    if (use.kind === "location") {
      const statements: CsharpStatement[] = [];
      for (const child of use.children) {
        const discarded = discardUse(child);
        if (discarded === undefined) return undefined;
        statements.push(...discarded);
      }
      return statements;
    }
    const value = planners.planExpression(use.expression, sourceFile, input, diagnostics, state);
    return value === undefined ? undefined : planCsharpPlannedDiscard(value);
  }
}
