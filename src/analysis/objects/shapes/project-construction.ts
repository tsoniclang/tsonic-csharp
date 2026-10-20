
import { createStructuralObjectShapeTarget } from "./construction.js";

import { isProjectSourceTargetType, projectClassIsObjectInitializable, typeHasProjectOwnedShapeDeclaration } from "./source-evidence.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

import type { CsharpProjectConstructibleTypeProjection } from "../../../target-model/records/object-shapes.js";

import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";

export function createCsharpProjectShapeProjection(
  host: CsharpObjectShapePolicyHost,
  deriveMembers: ReturnType<typeof createCsharpObjectShapeMemberResolver>["deriveMembers"],
): CsharpRecursiveObjectShapePolicy["resolveProjectConstructibleSelectedType"] {
  const environment = host.typeParameterConstraints;
  function resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    explicitTypeNode: Node | undefined,
    selectedType: Type,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection {
    if (!isProjectSourceTargetType(targetType)) {
      return { kind: "unchanged" };
    }
    const selectedTarget = host.typeResolver.resolveSelectedType(
      explicitTypeNode,
      selectedType,
      sourceFile,
      { depth: 0 },
    );
    if (
      selectedTarget === undefined ||
      !targetTypeRefEquals(selectedTarget, targetType)
    ) {
      return {
        kind: "rejected",
        reason:
          "The exact selected source type does not agree with its selected C# project type argument.",
      };
    }
    if (
      targetType.csharpSourceDeclarationKind === "struct" ||
      targetType.csharpSourceDeclarationKind === "enum"
    ) {
      return { kind: "unchanged" };
    }
    const queries = host.semantics(sourceFile);
    if (
      !typeHasProjectOwnedShapeDeclaration(
        selectedType,
        contextNode,
        queries,
        host,
      )
    ) {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument has no exact project-owned source declaration.",
      };
    }
    const members = deriveMembers(
      selectedType,
      queries,
      { depth: 0 },
      undefined,
      targetType,
    );
    if (members === undefined) {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument has no closed object-shape member projection.",
      };
    }
    if (targetType.csharpSourceDeclarationKind === "class") {
      if (!projectClassIsObjectInitializable(selectedType, queries, host)) {
        return {
          kind: "rejected",
          reason:
            "The selected C# project class is not constructible through an exact omittable-parameter constructor.",
        };
      }
      const shape = {
        targetType,
        members,
        constructible: true,
      } satisfies CsharpObjectShapeFact;
      return { kind: "resolved", shape };
    }
    if (targetType.csharpSourceDeclarationKind !== "interface") {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument is not a class, interface, struct, or enum.",
      };
    }
    const shape = {
      targetType: createStructuralObjectShapeTarget(
        members,
        [targetType],
        environment,
      ),
      members,
      implements: [targetType],
    } satisfies CsharpObjectShapeFact;
    return { kind: "resolved", shape };
  }

  return resolveProjectConstructibleSelectedType;
}
