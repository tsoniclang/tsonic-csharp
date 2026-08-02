import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpSelectedTargetCall,
} from "../../policy/members/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import {
  csharpTypeFromObjectShapeFact,
} from "../../backend/planner/object-shapes.js";
import type {
  CsharpTypeNode,
} from "../../backend/roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";

export function renderSelectedCsharpTargetMethodTypeArguments(
  selection: CsharpSelectedTargetCall,
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] | undefined {
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
    const projected = input.objectShapes.resolveProjectConstructibleSelectedType(
      argument.targetType,
      argument.explicitTypeNode,
      argument.selectedType,
      node,
      sourceFile,
    );
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
