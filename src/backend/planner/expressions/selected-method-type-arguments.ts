import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpSelectedTargetCall,
} from "../../../analysis/operations/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromObjectShapeFact,
} from "../objects/index.js";
import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function renderSelectedCsharpTargetMethodTypeArguments(
  selection: CsharpSelectedTargetCall,
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] | undefined {
  void sourceFile;
  const declaredProjections =
    selection.targetMember.csharpMethodTypeArgumentProjections ?? [];
  const projections = new Map(
    declaredProjections.map((projection) =>
      [projection.targetTypeParameterIndex, projection] as const
    ),
  );
  if (projections.size !== declaredProjections.length) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected target member '${selection.targetMember.id}' has contradictory method type-argument projections.`,
    ));
    return undefined;
  }
  const classification = input.program.source.ast.is.IsNewExpression(node)
    ? input.program.operations.construction(node)
    : input.program.operations.call(node);
  const classifiedProjections = new Map(
    (classification?.methodTypeArgumentProjections ?? []).map((projection) =>
      [projection.targetTypeParameterIndex, projection.projection] as const
    ),
  );
  const rendered: CsharpTypeNode[] = [];
  for (const [index, argument] of
    selection.targetMethodTypeArguments.entries()) {
    const projection = projections.get(index);
    if (projection === undefined) {
      const targetType = csharpTypeFromTargetTypeRef(argument.targetType);
      if (targetType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(
          node,
          `Selected target member '${selection.targetMember.id}' has an unrenderable target method type argument at index ${index}.`,
        ));
        return undefined;
      }
      rendered.push(targetType);
      continue;
    }
    if (argument.kind !== "selected-source") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected target member '${selection.targetMember.id}' requires exact source-selected type evidence for target method type argument ${index}.`,
      ));
      return undefined;
    }
    const projected = classifiedProjections.get(index);
    if (projected === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        argument.explicitTypeNode ?? node,
        `Selected target member '${selection.targetMember.id}' has no sealed C# type-argument projection at index ${index}.`,
      ));
      return undefined;
    }
    if (projected.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(
        argument.explicitTypeNode ?? node,
        `Selected target member '${selection.targetMember.id}' cannot close target method type argument ${index}. ${projected.reason}`,
      ));
      return undefined;
    }
    if (projected.kind === "unchanged") {
      const targetType = csharpTypeFromTargetTypeRef(argument.targetType);
      if (targetType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(
          argument.explicitTypeNode ?? node,
          `Selected target member '${selection.targetMember.id}' has an unrenderable unchanged target method type argument at index ${index}.`,
        ));
        return undefined;
      }
      rendered.push(targetType);
      continue;
    }
    const targetType = csharpTypeFromObjectShapeFact(
      input,
      projected.shape,
      diagnostics,
      argument.explicitTypeNode ?? node,
    );
    if (targetType === undefined) {
      return undefined;
    }
    rendered.push(targetType);
  }
  if ([...projections.keys()].some((index) => index >= rendered.length)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected target member '${selection.targetMember.id}' has an out-of-range method type-argument projection.`,
    ));
    return undefined;
  }
  return Object.freeze(rendered);
}
