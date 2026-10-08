import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import {
  csharpObjectShapeProjectionMethodName,
  csharpTsValueTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpJsValueTargetType,
} from "../../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planCsharpJsValueBox } from "./js-value-operations.js";
import { planCsharpUnionPattern } from "./union-patterns.js";

export function planCsharpPropertyValueProjection(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  if (sourceType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Checked property projection requires an exact source carrier."));
    return undefined;
  }
  if (isCsharpJsValueTargetType(sourceType)) return expression;
  const resultType = csharpTsValueTargetType();
  const resultSyntax = csharpTypeFromTargetTypeRef(resultType, input.scope.typeParameterNames);
  if (resultSyntax === undefined) return undefined;
  if (expression.kind === "LiteralExpression" && expression.value === null) {
    return { kind: "DefaultExpression", type: resultSyntax };
  }
  const present = getCsharpNullableElementTargetType(sourceType);
  if (present !== undefined) {
    const presentSyntax = csharpTypeFromTargetTypeRef(present, input.scope.typeParameterNames);
    if (presentSyntax === undefined) return undefined;
    const name = input.names.temporaryName(`__tsonic_properties_${input.program.source.ast.pos(node)}`);
    const projected = planCsharpPropertyValueProjection(node, sourceFile, input, diagnostics, present,
      { kind: "IdentifierName", name });
    return projected === undefined ? undefined : {
      kind: "ConditionalExpression",
      condition: { kind: "IsPatternExpression", expression, type: presentSyntax, designation: name },
      whenTrue: projected,
      whenFalse: { kind: "DefaultExpression", type: resultSyntax },
    };
  }
  if (getCsharpRuntimeUnionArms(sourceType, input.program.typeDefinitions) !== undefined) {
    const leaves = csharpUnionLeaves(sourceType, input.program.typeDefinitions);
    if (leaves === undefined) return undefined;
    const arms: CsharpSwitchExpressionArm[] = [];
    for (const [index, leaf] of leaves.entries()) {
      const name = input.names.temporaryName(`__tsonic_properties_${input.program.source.ast.pos(node)}_${index}`);
      const selected = planCsharpUnionPattern({ kind: "IdentifierName", name }, leaf.path, sourceType);
      const projected = planCsharpPropertyValueProjection(node, sourceFile, input, diagnostics, leaf.carrier, selected.value);
      if (projected === undefined || selected.condition === undefined) return undefined;
      arms.push({ pattern: { kind: "VarPattern", designation: name }, when: selected.condition, expression: projected });
    }
    arms.push({ pattern: { kind: "DiscardPattern" }, expression: {
      kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
        type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
        arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Invalid native union variant" } }],
      },
    } });
    return { kind: "SwitchExpression", expression, arms };
  }
  const shape = input.types.objectShapes.resolveTarget(sourceType);
  if (shape === undefined) return planCsharpJsValueBox(node, input, diagnostics, sourceType, expression);
  const selected = input.artifacts.requireObjectShapeProjection(undefined, sourceType, sourceFile,
    "properties", resultType, "object-shape");
  if (selected.kind === "rejected" || selected.projection?.kind !== "properties") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selected.kind === "rejected" ? selected.reason
      : "Checked property projection requires its exact generated shape method."));
    return undefined;
  }
  return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression,
      name: csharpObjectShapeProjectionMethodName(selected.projection) }, arguments: [],
  };
}
