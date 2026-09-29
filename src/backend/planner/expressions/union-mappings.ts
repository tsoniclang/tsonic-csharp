import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../policy/conversions/selection/model.js";
import { getCsharpNullableElementTargetType, type TargetTypeRef } from "../../../target-model/types/index.js";
import { csharpUnionArmMappingsEqual, selectCsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./runtime-union-projections.js";

export function planCsharpUnionMapping(
  node: Node,
  expression: CsharpExpression,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  const sourceUnion = sourceElement ?? source;
  const targetUnion = targetElement ?? target;
  const mappings = sourceUnion === undefined || targetUnion === undefined ? undefined
    : selectCsharpUnionArmMapping(sourceUnion, targetUnion, selection.coverage);
  const resultType = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target, input.scope.typeParameterNames);
  if (mappings === undefined || resultType === undefined ||
    !csharpUnionArmMappingsEqual(mappings, selection.arms) ||
    selection.coverage === "target" && targetElement !== undefined && sourceElement === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Union conversion requires exact sealed arm coverage and native absence correspondence."));
    return undefined;
  }
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const [index, mapping] of mappings.entries()) {
    const designation = input.names.temporaryName(`__tsonic_union_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}_${index}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    let value: CsharpExpression = receiver;
    let when: CsharpExpression | undefined;
    for (const [depth, step] of mapping.source.entries()) {
      const carrier = depth === 0 ? source : step.union;
      const test = runtimeUnionArmTest(value, step.index, carrier);
      when = when === undefined ? test : { kind: "BinaryExpression", left: when,
        operatorToken: { kind: "AmpersandAmpersandToken" }, right: test };
      value = runtimeUnionArmProjection(value, step.index, carrier);
    }
    for (const step of [...mapping.target].reverse()) {
      const type = csharpTypeFromTargetTypeRef(step.union, input.scope.typeParameterNames);
      if (type === undefined) return undefined;
      value = { kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: `From${step.index + 1}` },
        arguments: [{ kind: "Argument", expression: value }] };
    }
    arms.push({ pattern: { kind: "VarPattern", designation }, when,
      expression: targetElement === undefined ? value : { kind: "CastExpression", type: resultType, expression: value } });
  }
  if (sourceElement !== undefined && targetElement !== undefined) arms.push({
    pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
    expression: { kind: "DefaultExpression", type: resultType },
  });
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: {
    kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
      type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native union variant" } }],
    },
  } });
  return { kind: "SwitchExpression", expression, arms };
}
