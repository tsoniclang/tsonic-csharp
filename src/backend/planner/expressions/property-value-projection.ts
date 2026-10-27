import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTsValueTargetType } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpSwitchExpressionArm } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpClosedShapeMemberProjection } from "../../../target-model/records/objects/closed-object-shapes.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";
import { requireCsharpNativeExpressionUse } from "./native-uses.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planCsharpJsValueBox } from "./js-value-operations.js";
import { planCsharpUnionPattern } from "./union-patterns.js";
import { renderCsharpClosedShapeConversion } from "../objects/closed-object-shapes.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpPropertyValueProjection(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], targetType: TargetTypeRef, planExpression: ExpressionPlanner,
  state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const use = requireCsharpNativeExpressionUse(input, node).use;
  if (use.kind === "erased" || use.completion.kind !== "value") {
    const planned = planExpression(node, sourceFile, input, diagnostics, state);
    if (planned?.completion.kind === "value") failCsharpPlannerInvariant("An admitted property projection requires its exact source carrier.", node);
    return planned?.completion.kind === "never" ? planned : undefined;
  }
  const sourceType = use.completion.type;
  const selected = input.program.records.propertyValueProjection.get(node, sourceType);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted property projection requires its exact native representation.", node);
  if (selected.kind === "object" && selected.literal !== undefined) {
    const prelude: CsharpStatement[] = [];
    const values = new Map<CsharpClosedShapeMemberProjection, CsharpExpression>();
    for (const initializer of selected.literal) {
      const value = planExpression(initializer.initializer, sourceFile, input, diagnostics, state);
      if (value === undefined) return undefined;
      prelude.push(...value.prelude);
      if (value.completion.kind === "never") return { prelude, completion: value.completion };
      if (value.completion.kind !== "value") failCsharpPlannerInvariant("An admitted property initializer requires its native value completion.", initializer.initializer);
      const capture = captureCsharpPlannedValue(initializer.initializer, input, initializer.projection.member.type);
      if (capture === undefined) return undefined;
      prelude.push({ kind: "LocalDeclarationStatement", ...capture, initializer: value.completion.expression });
      values.set(initializer.projection, { kind: "IdentifierName", name: capture.name });
    }
    const resultType = csharpTsValueTargetType();
    const resultSyntax = csharpTypeFromTargetTypeRef(resultType, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted property projection requires its native closed result type.", node);
    const arguments_: CsharpExpression[] = [];
    for (const projection of selected.members) {
      const value = values.get(projection)
        ?? failCsharpPlannerInvariant("An admitted literal projection requires every exact native member initializer.", node);
      arguments_.push({ kind: "LiteralExpression", value: projection.member.sourceName },
        renderCsharpClosedShapeConversion(input.scope.typeParameterNames, projection.conversion, value));
    }
    return csharpPlannedValue(targetType, { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: resultSyntax, name: "CreateDynamicObject" },
      arguments: arguments_.map(expression => ({ kind: "Argument", expression })) }, prelude);
  }
  return mapCsharpPlannedValue(planExpression(node, sourceFile, input, diagnostics, state), targetType, expression =>
    renderCsharpPropertyValueProjection(node, sourceFile, input, diagnostics, sourceType, expression));
}

function renderCsharpPropertyValueProjection(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], sourceType: TargetTypeRef | undefined, expression: CsharpExpression): CsharpExpression | undefined {
  if (sourceType === undefined) failCsharpPlannerInvariant("An admitted property projection requires its exact source carrier.", node);
  const selected = input.program.records.propertyValueProjection.get(node, sourceType);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted property projection requires its exact native representation.", node);
  if (selected.kind === "identity") return expression;
  const resultSyntax = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted property projection requires its native closed result type.", node);
  if (selected.kind === "absence") return { kind: "SwitchExpression", expression,
    arms: [{ pattern: { kind: "DiscardPattern" }, expression: { kind: "DefaultExpression", type: resultSyntax } }] };
  if (selected.kind === "optional") {
    const present = csharpTypeFromTargetTypeRef(selected.present, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted optional property projection requires its native payload type.", node);
    const name = input.names.temporaryName(`__tsonic_properties_${input.program.source.ast.pos(node)}`);
    const projected = renderCsharpPropertyValueProjection(node, sourceFile, input, diagnostics, selected.present, { kind: "IdentifierName", name });
    if (projected === undefined) return undefined;
    return { kind: "ConditionalExpression", condition: { kind: "IsPatternExpression", expression, type: present, designation: name },
      whenTrue: projected, whenFalse: { kind: "DefaultExpression", type: resultSyntax } };
  }
  if (selected.kind === "union") {
    const arms: CsharpSwitchExpressionArm[] = [];
    for (const [index, leaf] of selected.leaves.entries()) {
      const name = input.names.temporaryName(`__tsonic_properties_${input.program.source.ast.pos(node)}_${index}`);
      const arm = planCsharpUnionPattern({ kind: "IdentifierName", name }, leaf.path, sourceType, false, input);
      const projected = renderCsharpPropertyValueProjection(node, sourceFile, input, diagnostics, leaf.carrier, arm.value);
      if (projected === undefined) return undefined;
      if (arm.condition === undefined) failCsharpPlannerInvariant("An admitted native union leaf requires its exact tag condition.", node);
      arms.push({ pattern: { kind: "VarPattern", designation: name }, when: arm.condition, expression: projected });
    }
    arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: {
      kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Invalid native union variant" } }],
    } } });
    return { kind: "SwitchExpression", expression, arms };
  }
  if (selected.kind === "boxed") return planCsharpJsValueBox(node, input, diagnostics, sourceType, expression);
  const name = input.names.temporaryName(`__tsonic_properties_${input.program.source.ast.pos(node)}`);
  const values: CsharpExpression[] = [];
  for (const { member, conversion } of selected.members) values.push({ kind: "LiteralExpression", value: member.sourceName },
    renderCsharpClosedShapeConversion(input.scope.typeParameterNames, conversion, {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: member.targetName,
    }));
  return { kind: "SwitchExpression", expression, arms: [{
    pattern: selected.members.length === 0 ? { kind: "DiscardPattern" } : { kind: "VarPattern", designation: name },
    expression: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: resultSyntax, name: "CreateDynamicObject" },
      arguments: values.map(value => ({ kind: "Argument", expression: value })) },
  }] };
}
