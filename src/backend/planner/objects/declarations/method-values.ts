import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { csharpObjectShapeMemberContractKey, targetTypeRefKey } from "../../../../target-model/types/index.js";
import type { CsharpTypeMember } from "../../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { objectShapeStorageMemberName } from "../object-shape-storage.js";

export function renderCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpTypeMember[] | undefined {
  const pending = [...shape.implements ?? []];
  const visited = new Set<string>();
  const members: CsharpTypeMember[] = [];
  for (let index = 0; index < pending.length; index++) {
    const type = pending[index]!;
    const key = targetTypeRefKey(type);
    if (visited.has(key)) continue;
    visited.add(key);
    const contract = input.types.objectShapes.resolveTarget(type);
    if (contract === undefined) return undefined;
    pending.push(...contract.implements ?? []);
    if (!input.artifacts.objectShapeHasCapability(contract, "method-values")) continue;
    const explicitInterface = csharpTypeFromTargetTypeRef(type);
    if (explicitInterface === undefined) return undefined;
    for (const required of contract.members) {
      if (required.memberKind !== "method") continue;
      const exact = shape.members.filter(candidate =>
        csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(required));
      const selected = exact.length === 1 ? exact[0] : undefined;
      const memberType = selected === undefined ? undefined : csharpTypeFromTargetTypeRef(selected.type);
      if (selected === undefined || memberType === undefined || input.artifacts.objectShapeMethodUsesReceiver(shape, selected)) return undefined;
      members.push({ kind: "PropertyDeclaration", name: objectShapeStorageMemberName(contract, required),
        explicitInterface, modifiers: [], type: memberType, getter: { kind: "Block", statements: [{
          kind: "ReturnStatement", expression: { kind: "IdentifierName", name: objectShapeStorageMemberName(shape, selected) },
        }] } });
    }
  }
  return members;
}
