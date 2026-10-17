import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeUse, CsharpNativeDiscardedPresence, CsharpNativeDiscardedGuard } from "../../../target-model/records/native-demand.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planArrayLiteralExpressionWithCarrier } from "./array-literals/index.js";
import { planObjectLiteralExpression } from "../objects/object-literals/planning.js";
import { tryPlanRecordDictionaryLiteralWithCarrier } from "./expression-dictionary-literals.js";
import { planSelectedCsharpBinaryOperation } from "./operators/selected-binary.js";
import { planCsharpConditionExpression } from "./expression-bool-carriers.js";
import { planCsharpExactLiteralRecipe } from "./literal-conversions.js";
import { planVoidExpression } from "./expression-void.js";
import { planCsharpAbsentValue } from "./optional-storage.js";
import { planCsharpStorageIsAbsent } from "./optional-storage.js";
import { isCsharpRecordDictionaryTargetType } from "../../../target-model/types/carriers/collections.js";
import { csharpPlannedEffect, csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpJsValueBox, translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { captureCsharpPlannedValue, planCsharpExpressionCompletion, planCsharpValueBranch } from "./planned-value-composition.js";
import { applyCsharpConversionSelection, readCsharpExpressionConversionClassification } from "./conversions.js";
import { requireCsharpNativeExpressionUse } from "./native-uses.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";

export interface CsharpNativeExpressionPlanners {
  readonly planSourceExpression: ExpressionPlanner;
  readonly planExpression: ExpressionPlanner;
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
  if (selected.completion.kind === "void") return csharpPlannedEffect(selected.target, planCsharpPlannedDiscard(planned));
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
    if (use.discardedPresence !== undefined) return renderDiscarded(use.discardedPresence);
    if (use.binary !== undefined) return planSelectedCsharpBinaryOperation(node, use.binary, sourceFile, input, diagnostics, planners.planExpression, state);
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
      const condition = planCsharpConditionExpression(conditional.Condition, "Conditional expression condition", sourceFile, input,
        diagnostics, planners.planExpression);
      const whenTrue = planners.planExpression(conditional.WhenTrue, sourceFile, input, diagnostics, state);
      const whenFalse = planners.planExpression(conditional.WhenFalse, sourceFile, input, diagnostics, state);
      const consequent = use.completion.kind === "void" ? discardedPlan(whenTrue) : whenTrue;
      const alternative = use.completion.kind === "void" ? discardedPlan(whenFalse) : whenFalse;
      if (use.completion.kind === "void" && condition !== undefined && consequent !== undefined && alternative !== undefined &&
        consequent.prelude.length === 0 && alternative.prelude.length === 0 &&
        consequent.completion.kind === "void" && alternative.completion.kind === "void") {
        return csharpPlannedEffect(csharpVoidTargetType(), planCsharpPlannedDiscard(condition));
      }
      return planCsharpValueBranch(node, sourceFile, input, diagnostics, condition, consequent, alternative, use.carrier);
    }
    if (ast.is.IsArrayLiteralExpression(node)) return planArrayLiteralExpressionWithCarrier(
      node, sourceFile, input, diagnostics, use.carrier, planners);
    if (ast.is.IsObjectLiteralExpression(node)) {
      const type = csharpTypeFromTargetTypeRef(use.carrier, input.scope.typeParameterNames);
      if (type === undefined) return failCsharpPlannerInvariant("A native object construction requires a renderable carrier.", node);
      return isCsharpRecordDictionaryTargetType(use.carrier)
        ? tryPlanRecordDictionaryLiteralWithCarrier(node, sourceFile, input, diagnostics, planners.planExpression, use.carrier)
        : planObjectLiteralExpression(node, sourceFile, input, diagnostics, planners.planExpression, state);
    }
    return planners.planSourceExpression(node, sourceFile, input, diagnostics, state);
  }

  function renderDiscarded(recipe: CsharpNativeDiscardedPresence): CsharpPlannedValue | undefined {
    switch (recipe.kind) {
      case "constant": return prefixEffects(recipe.effects, () => csharpPlannedEffect(csharpVoidTargetType(), []));
      case "value": case "never": return discardedPlan(planSite(recipe.site));
      case "sequence": return prefixEffects(recipe.effects, () => renderDiscarded(recipe.result));
      case "conditional": return effectBranch(planCondition(recipe.condition),
        renderDiscarded(recipe.whenTrue), renderDiscarded(recipe.whenFalse));
      case "coalescing": {
        const left = recipe.left;
        if (left.kind === "constant") return prefixEffects(left.effects, () => left.present
          ? csharpPlannedEffect(csharpVoidTargetType(), []) : renderDiscarded(recipe.right));
        return effectBranch(renderPresence(recipe.left), csharpPlannedEffect(csharpVoidTargetType(), []), renderDiscarded(recipe.right));
      }
      case "short-circuit": {
        const left = planSite(recipe.left);
        const right = renderDiscarded(recipe.right);
        if (right !== undefined && right.completion.kind === "void" && right.prelude.length === 0) return discardedPlan(left);
        const condition = selectedGuard(recipe.guard, recipe.left, left);
        const empty = csharpPlannedEffect(csharpVoidTargetType(), []);
        return effectBranch(condition, recipe.guard.whenTrue === "right" ? right : empty,
          recipe.guard.whenTrue === "right" ? empty : right);
      }
    }
  }

  function renderPresence(recipe: CsharpNativeDiscardedPresence,
    values: ReadonlyMap<TargetUseSiteRef, CsharpPlannedValue> = new Map()): CsharpPlannedValue | undefined {
    switch (recipe.kind) {
      case "constant": return prefixEffects(recipe.effects, () => presenceLiteral(recipe.present), values);
      case "never": return planSite(recipe.site, values);
      case "value": {
        const value = planSite(recipe.site, values);
        if (value === undefined || value.completion.kind === "never") return value;
        if (value.completion.kind !== "value") return failCsharpPlannerInvariant("An observed discarded presence requires its native value.", node);
        const absent = planCsharpStorageIsAbsent(value.completion.carrier, value.completion.expression, input.scope.typeParameterNames);
        if (absent === undefined) return failCsharpPlannerInvariant("An admitted nullable presence requires its native absence test.", node);
        return csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"),
          { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: { kind: "ParenthesizedExpression", expression: absent } }, value.prelude);
      }
      case "sequence": return prefixEffects(recipe.effects, () => renderPresence(recipe.result, values), values);
      case "conditional": return planCsharpValueBranch(node, sourceFile, input, diagnostics, planCondition(recipe.condition, values),
        renderPresence(recipe.whenTrue, values), renderPresence(recipe.whenFalse, values), csharpSourcePrimitiveTargetType("bool"));
      case "coalescing": {
        const left = recipe.left;
        if (left.kind === "constant") return prefixEffects(left.effects,
          () => left.present ? presenceLiteral(true) : renderPresence(recipe.right, values), values);
        return planCsharpValueBranch(node, sourceFile, input, diagnostics, renderPresence(recipe.left, values), presenceLiteral(true),
          renderPresence(recipe.right, values), csharpSourcePrimitiveTargetType("bool"));
      }
      case "short-circuit": {
        const left = planSite(recipe.left, values);
        if (left === undefined || left.completion.kind === "never") return left;
        if (left.completion.kind !== "value") return failCsharpPlannerInvariant("An admitted short-circuit condition requires its native value.", node);
        const capture = captureCsharpPlannedValue(node, input, diagnostics, left.completion.carrier);
        if (capture === undefined) return undefined;
        const captured = csharpPlannedValue(left.completion.carrier, { kind: "IdentifierName", name: capture.name });
        const observed = new Map(values);
        observed.set(recipe.left, captured);
        const condition = selectedGuard(recipe.guard, recipe.left, captured);
        const original = renderPresence(recipe.leftPresence, observed);
        const right = renderPresence(recipe.right, observed);
        const result = planCsharpValueBranch(node, sourceFile, input, diagnostics, condition,
          recipe.guard.whenTrue === "right" ? right : original,
          recipe.guard.whenTrue === "right" ? original : right, csharpSourcePrimitiveTargetType("bool"));
        return result === undefined ? undefined : { prelude: [...left.prelude,
          { kind: "LocalDeclarationStatement", name: capture.name, type: capture.type, initializer: left.completion.expression },
          ...result.prelude], completion: result.completion };
      }
    }
  }

  function selectedGuard(guard: Exclude<CsharpNativeDiscardedGuard, { readonly kind: "coalescing" }>, site: TargetUseSiteRef,
    value: CsharpPlannedValue | undefined): CsharpPlannedValue | undefined {
    if (value === undefined || value.completion.kind === "never") return value;
    if (value.completion.kind !== "value") return failCsharpPlannerInvariant("A discarded short-circuit guard requires its completed condition.", node);
    if (guard.kind === "boolean") return value;
    const use = nativeUse(site);
    const boxed = planCsharpJsValueBox(use.expression, input, diagnostics, value.completion.carrier, value.completion.expression);
    const selected = guard.condition;
    const expression = boxed === undefined ? undefined : translateCsharpJsValueInvocation(input.scope.typeParameterNames,
      selected, selected.dispatch === "instance" ? boxed : undefined, selected.dispatch === "instance" ? [] : [boxed]);
    return expression === undefined ? failCsharpPlannerInvariant("A discarded JS short circuit requires its admitted native condition.", node)
      : csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), expression, value.prelude);
  }

  function prefixEffects(effects: readonly TargetUseSiteRef[], result: () => CsharpPlannedValue | undefined,
    values: ReadonlyMap<TargetUseSiteRef, CsharpPlannedValue> = new Map()): CsharpPlannedValue | undefined {
    const prelude: CsharpStatement[] = [];
    for (const site of effects) {
      if (values.has(site)) continue;
      const effect = planSite(site, values);
      if (effect === undefined) return undefined;
      prelude.push(...planCsharpPlannedDiscard(effect));
      if (effect.completion.kind === "never") return { prelude, completion: effect.completion };
    }
    const completed = result();
    return completed === undefined ? undefined : { prelude: [...prelude, ...completed.prelude], completion: completed.completion };
  }

  function planSite(site: TargetUseSiteRef, values: ReadonlyMap<TargetUseSiteRef, CsharpPlannedValue> = new Map()): CsharpPlannedValue | undefined {
    const existing = values.get(site);
    if (existing !== undefined) return existing;
    const use = input.program.records.nativeUse.get(site);
    if (use === undefined) return failCsharpPlannerInvariant("Discarded presence requires its exact admitted operand.", node);
    return planners.planExpression(use.expression, sourceFile, input, diagnostics, state);
  }

  function planCondition(site: TargetUseSiteRef, values: ReadonlyMap<TargetUseSiteRef, CsharpPlannedValue> = new Map()): CsharpPlannedValue | undefined {
    const existing = values.get(site);
    return existing !== undefined ? existing : planCsharpConditionExpression(nativeUse(site).expression,
      "Discarded conditional condition", sourceFile, input, diagnostics, planners.planExpression);
  }

  function presenceLiteral(present: boolean): CsharpPlannedValue {
    return csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), { kind: "LiteralExpression", value: present });
  }

  function effectBranch(condition: CsharpPlannedValue | undefined, consequent: CsharpPlannedValue | undefined,
    alternative: CsharpPlannedValue | undefined): CsharpPlannedValue | undefined {
    if (condition !== undefined && consequent !== undefined && alternative !== undefined &&
      consequent.completion.kind === "void" && alternative.completion.kind === "void" &&
      consequent.prelude.length === 0 && alternative.prelude.length === 0) return discardedPlan(condition);
    return planCsharpValueBranch(node, sourceFile, input, diagnostics, condition, consequent, alternative, csharpVoidTargetType());
  }

  function discardedPlan(value: CsharpPlannedValue | undefined): CsharpPlannedValue | undefined {
    return value === undefined || value.completion.kind === "never" ? value
      : csharpPlannedEffect(csharpVoidTargetType(), planCsharpPlannedDiscard(value));
  }

  function nativeUse(site: TargetUseSiteRef): Exclude<CsharpNativeUse, { readonly kind: "erased" }> {
    const use = input.program.records.nativeUse.get(site);
    return use === undefined || use.kind === "erased" ? failCsharpPlannerInvariant(
      "Native ordered evaluation requires its admitted child completion.", node) : use;
  }

  function discardUse(site: TargetUseSiteRef): readonly CsharpStatement[] | undefined {
    if (input.program.records.nativeUse.get(site)?.kind === "erased") return [];
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
