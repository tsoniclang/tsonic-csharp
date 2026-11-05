
import { createStructuralObjectShapeTarget } from "./construction.js";

import { isProjectSourceTargetType } from "./source-evidence.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceTypeDescriptor } from "@tsonic/target-api/source";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

import type { CsharpProjectConstructibleTypeProjection } from "../../../target-model/records/objects/object-shapes.js";

import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";

export function createCsharpProjectShapeProjection(
  host: CsharpObjectShapePolicyHost,
  deriveMembers: ReturnType<typeof createCsharpObjectShapeMemberResolver>["deriveMembers"],
): CsharpRecursiveObjectShapePolicy["resolveProjectConstructibleSelectedType"] {
  const environment = host.typeParameterConstraints;
  function resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    descriptor: SourceTypeDescriptor,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection {
    if (!isProjectSourceTargetType(targetType)) {
      return { kind: "unchanged" };
    }
    const selectedTarget = host.typeResolver.resolveDescriptor(descriptor, contextNode, { depth: 0 });
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
    const definition = host.projectTypeCatalog.definitionForTarget(targetType);
    let selectedReference = descriptor;
    while (selectedReference.kind === "optional" ||
      selectedReference.kind === "declared" && selectedReference.declaration !== definition?.declaration &&
      selectedReference.definition !== undefined) {
      selectedReference = selectedReference.kind === "optional" ? selectedReference.value : selectedReference.definition!;
    }
    const reference = selectedReference.kind === "declared" ? selectedReference : undefined;
    if (definition === undefined || reference === undefined || definition.declaration !== reference.declaration ||
      !host.navigation.isProjectDeclaration(reference.declaration)) {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument has no exact project-owned source declaration.",
      };
    }
    if (reference.definition === undefined || sourceTypeDescriptorStructure(reference).kind !== "shape") {
      return { kind: "rejected", reason: reference.cut === "unexpressible"
        ? "The Host-published project reference has unexpressible structure."
        : "A project construction requires the Host-published full reference definition, not a recursion cut." };
    }
    const members = deriveMembers(
      descriptor, contextNode,
      queries,
      { depth: 0 },
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
      const constructors = host.navigation.classConstructors(reference.declaration);
      if (constructors.kind !== "resolved" || definition.abstract || !constructors.signatures.some(signature =>
        signature.parameters.every(parameter => parameter.acceptsOmission))) {
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
