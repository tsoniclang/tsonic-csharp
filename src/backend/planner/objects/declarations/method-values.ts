import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { csharpObjectShapeMemberContractKey, targetTypeRefKey } from "../../../../target-model/types/index.js";
import type { CsharpTypeMember } from "../../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { objectShapeStorageMemberName } from "../object-shape-storage.js";
import { csharpNullableTargetType } from "../../../../target-model/types/nullable.js";
import { csharpObjectShapeMethodDeclaration } from "../../../../target-model/types/method-values.js";
import { csharpPresentObjectShapeMethod } from "../../../../target-model/types/method-values.js";

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
    const explicitInterface = csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames);
    if (explicitInterface === undefined) return undefined;
    for (const required of contract.members) {
      if (required.memberKind !== "method") continue;
      const nativeMethod = required.methodValueContract !== undefined;
      const requiredSignature = csharpPresentObjectShapeMethod(required);
      const exact = shape.members.filter(candidate => {
        const signature = csharpPresentObjectShapeMethod(candidate);
        return signature !== undefined && requiredSignature !== undefined &&
          csharpObjectShapeMemberContractKey(signature) === csharpObjectShapeMemberContractKey(requiredSignature);
      });
      const selected = exact.length === 1 ? exact[0] : undefined;
      const valueType = nativeMethod ? required.methodValueContract : selected?.type;
      const memberType = valueType === undefined ? undefined : csharpTypeFromTargetTypeRef(
        required.optional === true ? csharpNullableTargetType(valueType) : valueType, input.scope.typeParameterNames);
      if (selected === undefined || memberType === undefined || input.artifacts.objectShapeMethodUsesReceiver(shape, selected)) return undefined;
      members.push({ kind: "PropertyDeclaration", name: objectShapeStorageMemberName(contract, required),
        explicitInterface, modifiers: [], type: memberType, getter: { kind: "Block", statements: [{
          kind: "ReturnStatement", expression: { kind: "IdentifierName", name: nativeMethod && selected.methodStorageType === undefined &&
            csharpObjectShapeMethodDeclaration(shape, selected) !== undefined
            ? "this" : objectShapeStorageMemberName(shape, selected) },
        }] } });
    }
  }
  return members;
}
