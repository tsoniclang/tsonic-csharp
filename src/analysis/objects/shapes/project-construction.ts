import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectConstructibleTypeProjection } from "../../../target-model/records/objects/object-shapes.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { isProjectSourceTargetType } from "./source-evidence.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { formCsharpProjectConstructionSource, type CsharpProjectConstructionSource } from "./project-construction-source.js";
import type { CsharpObjectShapeTargetInput } from "./method-values.js";
import { csharpStructuralHeaderMembers } from "./member-evidence.js";

export function createCsharpProjectShapeProjection(
  host: CsharpObjectShapePolicyHost,
  dependencies: Pick<ReturnType<typeof createCsharpObjectShapeMemberResolver>,
    "collectMembers" | "formSourceMembersHeader" | "completeSourceMembers" | "completeSourceShape"> & {
    readonly formTargetShape: (input: CsharpObjectShapeTargetInput) => CsharpObjectShapeFact;
  },
) {
  const { collectMembers, formSourceMembersHeader, completeSourceMembers, completeSourceShape } = dependencies;

  function completeSource(
    source: CsharpProjectConstructionSource,
    targetType: TargetTypeRef,
  ): CsharpProjectConstructibleTypeProjection {
    if (!isProjectSourceTargetType(targetType)) return { kind: "unchanged" };
    const selectedTarget = host.completeAuthoredSelection(source.selection);
    if (selectedTarget === undefined || !targetTypeRefEquals(selectedTarget, targetType)) return {
      kind: "rejected", reason: "The exact selected source type does not agree with its selected C# project type argument.",
    };
    if (targetType.csharpSourceDeclarationKind === "struct" || targetType.csharpSourceDeclarationKind === "enum") {
      return { kind: "unchanged" };
    }
    if (!source.projectOwned) return { kind: "rejected",
      reason: "The selected C# project type argument has no exact project-owned source declaration." };
    const header = source.members === undefined ? undefined : formSourceMembersHeader(source.members, targetType);
    if (header === undefined) return { kind: "rejected",
      reason: "The selected C# project type argument has no closed object-shape member projection." };
    if (targetType.csharpSourceDeclarationKind === "class") {
      const members = completeSourceMembers(header);
      if (members === undefined) return { kind: "rejected",
        reason: "The selected C# project type argument has no closed object-shape member projection." };
      if (!source.initializable) return { kind: "rejected",
        reason: "The selected C# project class is not constructible through an exact omittable-parameter constructor." };
      return { kind: "resolved", shape: { targetType, members, constructible: true } };
    }
    if (targetType.csharpSourceDeclarationKind !== "interface") return { kind: "rejected",
      reason: "The selected C# project type argument is not a class, interface, struct, or enum." };
    const selected = dependencies.formTargetShape({
      target: Object.freeze({ kind: "structural", contract: false }),
      members: csharpStructuralHeaderMembers(header), implements: [targetType],
    });
    const shape = completeSourceShape(header, selected);
    return shape === undefined ? { kind: "rejected",
      reason: "The selected C# project type argument has no closed object-shape member projection." }
      : { kind: "resolved", shape };
  }

  const formSource = (...args: Parameters<CsharpRecursiveObjectShapePolicy["formProjectConstructionSource"]>) =>
    formCsharpProjectConstructionSource(host, collectMembers, ...args);
  const resolve: CsharpRecursiveObjectShapePolicy["resolveProjectConstructibleSelectedType"] =
    (targetType, explicitTypeNode, selectedType, contextNode, sourceFile) => completeSource(
      formSource(explicitTypeNode, selectedType, contextNode, sourceFile), targetType);
  return Object.freeze({ formSource, completeSource, resolve });
}
