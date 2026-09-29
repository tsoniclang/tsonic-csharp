import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../policy/conversions/selection/model.js";
import { getCsharpNullableElementTargetType, targetTypeRefEquals, type TargetTypeRef } from "../../../target-model/types/index.js";
import { selectCsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";
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
  const type = targetUnion === undefined ? undefined : csharpTypeFromTargetTypeRef(targetUnion, input.scope.typeParameterNames);
  const resultType = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target, input.scope.typeParameterNames);
  if (mappings === undefined || type === undefined || resultType === undefined ||
    mappings.length !== selection.arms.length || !mappings.every((arm, index) => {
      const selected = selection.arms[index];
      return selected !== undefined && selected.source === arm.source && selected.target === arm.target &&
        targetTypeRefEquals(selected.carrier, arm.carrier);
    }) || selection.coverage === "target" && targetElement !== undefined && sourceElement === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Union conversion requires exact sealed arm coverage and native absence correspondence."));
    return undefined;
  }
  const arms: CsharpSwitchExpressionArm[] = mappings.map(mapping => {
    const designation = input.names.temporaryName(`__tsonic_union_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}_${mapping.source}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const value: CsharpExpression = { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: `From${mapping.target + 1}` },
      arguments: [{ kind: "Argument", expression: runtimeUnionArmProjection(receiver, mapping.source, source) }],
    };
    return { pattern: { kind: "VarPattern", designation }, when: runtimeUnionArmTest(receiver, mapping.source, source),
      expression: targetElement === undefined ? value : { kind: "CastExpression", type: resultType, expression: value } };
  });
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
