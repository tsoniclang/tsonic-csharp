import type { CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";

import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";

import { csharpRenderShapeForTargetNamedType } from "../../../target-model/types/render-shapes.js";

export function csharpProjectHeritageKindIssue(
  definition: CsharpProjectTypeDefinition,
  relation: "extends" | "implements",
  targetKind: CsharpProjectTypeDefinition["kind"] | undefined,
  target: TargetTypeRef,
): string | undefined {
  if (definition.kind === "enum" || definition.kind === "struct") {
    return `Project ${definition.kind} '${definition.sourceName}' cannot declare C# heritage.`;
  }
  if (definition.kind === "interface") {
    if (relation === "implements") {
      return `Project interface '${definition.sourceName}' cannot implement a C# type.`;
    }
    return targetKind === "interface" || targetKind === undefined && isCsharpStructuralInterfaceTarget(target)
      ? undefined
      : `Project interface '${definition.sourceName}' cannot inherit the non-interface C# type '${csharpHeritageTargetName(target)}'.`;
  }
  if (relation === "extends") {
    if (target.kind !== "target-named") {
      return `Project class '${definition.sourceName}' cannot extend the non-class C# type '${csharpHeritageTargetName(target)}'.`;
    }
    return targetKind !== undefined && targetKind !== "class"
      ? `Project class '${definition.sourceName}' cannot extend the selected non-class C# type.`
      : undefined;
  }
  if (targetKind === "interface" || targetKind === undefined && isCsharpStructuralInterfaceTarget(target)) return undefined;
  return targetKind === undefined
    ? `Project class '${definition.sourceName}' cannot implement the C# type '${csharpHeritageTargetName(target)}' without an exact native interface declaration.`
    : `Project class '${definition.sourceName}' cannot implement the non-interface C# type '${csharpHeritageTargetName(target)}'.`;
}

function csharpHeritageTargetName(type: TargetTypeRef): string {
  const shape = type.kind === "target-named" ? csharpRenderShapeForTargetNamedType(type) : undefined;
  return shape?.kind === "named" ? [...(shape.namespace ?? []), shape.name].join(".") : targetTypeRefKey(type);
}

function isCsharpStructuralInterfaceTarget(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && (
    (type as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
    (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface"
  );
}
