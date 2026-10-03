import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAwaitAlternative, CsharpAwaitCompletion } from "../../../target-model/types/await-completions.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTaskTargetType } from "../../../target-model/types/delegates.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { isCsharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpVoidTargetType } from "../../../target-model/types/scalar-types.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpUnionPattern } from "./union-patterns.js";
import { planCsharpUnionMapping } from "./union-mappings.js";
import { csharpPlannedValue, csharpPlannedEffect, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { captureCsharpPlannedValue, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { planCsharpAbsentValue } from "./optional-storage.js";
import type { CsharpStatement } from "../../target-ast/roslyn/index.js";

export function planCsharpAwaitCompletion(
  node: Node,
  carrier: TargetTypeRef,
  completion: CsharpAwaitCompletion,
  planned: CsharpPlannedValue,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  if (!completion.alternatives.some(alternative => alternative.task)) return planned;
  if (planned.completion.kind !== "value") return undefined;
  const expression = planned.completion.expression;
  const discard = isCsharpVoidTargetType(completion.result);
  const resultType = csharpTypeFromTargetTypeRef(completion.result, input.scope.typeParameterNames);
  const taskType = csharpTypeFromTargetTypeRef(csharpTaskTargetType(csharpVoidTargetType()), input.scope.typeParameterNames);
  if (taskType === undefined || !discard && resultType === undefined) return undefined;
  const completedTask: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: taskType, name: "CompletedTask" };
  const projectResult = (alternative: CsharpAwaitAlternative, value: CsharpExpression): CsharpExpression | undefined => {
    if (discard) return alternative.task ? { kind: "CastExpression", type: taskType, expression: value } : completedTask;
    if (alternative.task && isCsharpVoidTargetType(alternative.result)) return undefined;
    if (isCsharpAbsenceTargetType(alternative.result)) return { kind: "DefaultExpression", type: resultType! };
    let result: CsharpExpression = alternative.task ? { kind: "AwaitExpression", expression: value } : value;
    if (alternative.resultMapping !== undefined) {
      const mapped = planCsharpUnionMapping(node, result, alternative.result, completion.result,
        { kind: "union-map", coverage: "source", arms: alternative.resultMapping }, input, diagnostics);
      if (mapped === undefined) return undefined;
      result = mapped;
    }
    for (const step of [...alternative.resultPath].reverse()) {
      const type = csharpTypeFromTargetTypeRef(step.union, input.scope.typeParameterNames);
      if (type === undefined) return undefined;
      result = { kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: `From${step.index + 1}` },
        arguments: [{ kind: "Argument", expression: result }] };
    }
    return { kind: "CastExpression", type: resultType!, expression: result };
  };
  if (completion.alternatives.length === 1 && !completion.optional &&
    completion.alternatives[0]!.sourcePath.length === 0) {
    const alternative = completion.alternatives[0]!;
    const result = discard || alternative.resultPath.length === 0 && alternative.resultMapping === undefined
      ? { kind: "AwaitExpression" as const, expression } : projectResult(alternative, expression);
    return planCsharpExpressionCompletion(node, input.program.source.ast.getSourceFile(node)!, input, diagnostics, result, completion.result, planned.prelude);
  }
  if (!discard && completion.alternatives.some(alternative => alternative.task && isCsharpVoidTargetType(alternative.result))) {
    const selected = captureCsharpPlannedValue(node, input, diagnostics, carrier);
    const result = captureCsharpPlannedValue(node, input, diagnostics, completion.result);
    const absent = planCsharpAbsentValue(completion.result, input.scope.typeParameterNames);
    if (selected === undefined || result === undefined || absent === undefined) return undefined;
    const receiver: CsharpExpression = { kind: "IdentifierName", name: selected.name };
    const assign = (value: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", left: { kind: "IdentifierName", name: result.name }, operatorToken: { kind: "EqualsToken" }, right: value,
    } });
    let remaining: readonly CsharpStatement[] = completion.optional ? [assign(absent)] : [{ kind: "ThrowStatement", expression: {
      kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native completion variant" } }],
    } }];
    for (const alternative of [...completion.alternatives].reverse()) {
      const selection = planCsharpUnionPattern(receiver, alternative.sourcePath, carrier);
      let value = selection.value;
      let condition = selection.condition;
      if (condition === undefined && completion.optional) {
        const type = csharpTypeFromTargetTypeRef(alternative.carrier, input.scope.typeParameterNames);
        if (type === undefined) return undefined;
        const name = input.names.temporaryName(`__tsonic_present_await_${input.program.source.ast.pos(node)}`);
        condition = { kind: "IsPatternExpression", expression: receiver, type, designation: name };
        value = { kind: "IdentifierName", name };
      }
      const projected = alternative.task && isCsharpVoidTargetType(alternative.result) ? absent : projectResult(alternative, value);
      if (projected === undefined) return undefined;
      const statements: readonly CsharpStatement[] = alternative.task && isCsharpVoidTargetType(alternative.result)
        ? [{ kind: "ExpressionStatement", expression: { kind: "AwaitExpression", expression: value } }, assign(projected)]
        : [assign(projected)];
      remaining = condition === undefined ? statements : [{ kind: "IfStatement", condition,
        thenBody: { kind: "Block", statements }, elseBody: { kind: "Block", statements: remaining } }];
    }
    return csharpPlannedValue(completion.result, { kind: "IdentifierName", name: result.name }, [
      ...planned.prelude, { kind: "LocalDeclarationStatement", name: selected.name, type: selected.type, initializer: expression },
      { kind: "LocalDeclarationStatement", name: result.name, type: result.type }, ...remaining,
    ]);
  }
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const [index, alternative] of completion.alternatives.entries()) {
    const designation = input.names.temporaryName(`__tsonic_await_${input.program.source.ast.pos(node)}_${index}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const selected = planCsharpUnionPattern(receiver, alternative.sourcePath, carrier);
    const value = projectResult(alternative, selected.value);
    if (value === undefined) return undefined;
    const presentType = alternative.sourcePath.length === 0 && completion.optional
      ? csharpTypeFromTargetTypeRef(alternative.carrier, input.scope.typeParameterNames) : undefined;
    arms.push({
      pattern: presentType === undefined ? { kind: "VarPattern", designation }
        : { kind: "DeclarationPattern", type: presentType, designation },
      ...(selected.condition === undefined ? {} : { when: selected.condition }),
      expression: value,
    });
  }
  if (completion.optional) arms.push({
    pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
    expression: discard ? completedTask : { kind: "DefaultExpression", type: resultType! },
  });
  if (completion.alternatives.some(alternative => alternative.sourcePath.length > 0)) arms.push({
    pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: {
      kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native completion variant" } }],
    } },
  });
  const selection: CsharpExpression = { kind: "SwitchExpression", expression, arms };
  const result: CsharpExpression = discard ? { kind: "AwaitExpression", expression: { kind: "ParenthesizedExpression", expression: selection } }
    : { kind: "ParenthesizedExpression", expression: selection };
  return planCsharpExpressionCompletion(node, input.program.source.ast.getSourceFile(node)!, input, diagnostics, result, completion.result, planned.prelude);
}
