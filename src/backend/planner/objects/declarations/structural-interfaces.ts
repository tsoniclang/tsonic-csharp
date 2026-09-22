import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/index.js";
import type { CsharpInterfaceMember } from "../../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { CsharpStorageClassifications } from "../../../../analysis/storage/model.js";
import { csharpRuntimeLocationTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { objectShapeStorageMemberName } from "../object-shape-storage.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeParameter } from "../../../target-ast/roslyn/index.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../../types/type-parameters.js";

export function renderCsharpStructuralInterfaceMembers(shape: CsharpObjectShapeFact, storage: CsharpStorageClassifications, methodValues: boolean, inherited: readonly CsharpObjectShapeFact[]): readonly CsharpInterfaceMember[] | undefined {
  const result: CsharpInterfaceMember[] = [];
  for (const member of shape.members) {
    if (member.memberKind === "method") {
      if (methodValues && (member.typeParameters?.length ?? 0) === 0) {
        const type = csharpTypeFromTargetTypeRef(member.type);
        if (type === undefined) return undefined;
        result.push({ kind: "PropertyDeclaration", name: objectShapeStorageMemberName(shape, member), type, writable: false });
      }
      const signature = getCsharpDelegateSignature(member.type);
      if (signature === undefined) return undefined;
      const returnType = csharpTypeFromTargetTypeRef(signature.returnType);
      const parameters = signature.parameters.map(csharpTypeFromTargetTypeRef);
      if (returnType === undefined || parameters.some(type => type === undefined)) return undefined;
      const issues: TargetDiagnostic[] = [];
      const typeParameters: CsharpTypeParameter[] = (member.typeParameters ?? []).map(parameter => ({
        name: parameter.name, constraints: parameter.constraints.flatMap(constraint => {
          const result = csharpGenericConstraintFromTargetTypeParameterConstraint(constraint, parameter.declaration, issues);
          return result === undefined ? [] : [result];
        }),
      }));
      if (issues.length > 0) return undefined;
      result.push({ kind: "MethodDeclaration", name: member.targetName, returnType, typeParameters,
        parameters: parameters.map((type, index) => ({ name: `arg${index}`, type: type!,
          ...(signature.restParameterIndex === index ? { isParams: true } : {}),
          ...(signature.optionalParameterIndexes?.includes(index) ? { defaultValue: { kind: "DefaultExpression" as const, type: type! } } : {}),
        })) });
    } else {
      const type = csharpTypeFromTargetTypeRef(member.type);
      if (type === undefined) return undefined;
      result.push({ kind: "PropertyDeclaration", name: member.targetName, type,
        writable: member.readonly !== true && member.accessor?.setter !== false });
      const backing = storage.nativeField(shape.targetType, member.targetName);
      if (backing !== undefined) {
        const locationType = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(member.type));
        if (locationType === undefined) return undefined;
        result.push({ kind: "PropertyDeclaration", name: backing.storageName, type: locationType, writable: false });
      }
    }
  }
  const inheritedNames = new Set<string>();
  for (const parent of inherited) {
    const members = renderCsharpStructuralInterfaceMembers(parent, storage, methodValues, []);
    if (members === undefined) return undefined;
    for (const member of members) {
      if (member.kind !== "IndexerDeclaration") inheritedNames.add(member.name);
    }
  }
  return result.map(member => member.kind !== "IndexerDeclaration" && inheritedNames.has(member.name)
    ? { ...member, modifiers: ["new"] } : member);
}
