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
import { csharpNullableTargetType } from "../../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpPlanningContext } from "../../context.js";

export interface CsharpInheritedStructuralInterface {
  readonly shape: CsharpObjectShapeFact;
  readonly methodValues: boolean;
}

export function csharpInheritedStructuralInterfaces(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpInheritedStructuralInterface[] {
  return (shape.implements ?? []).flatMap(type => {
    const parent = input.types.objectShapes.resolveTarget(type);
    return parent === undefined ? [] : [{
      shape: parent, methodValues: input.artifacts.objectShapeHasCapability(parent, "method-values"),
    }];
  });
}

export function csharpMethodValueHandleIsInherited(
  shape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  inherited: readonly CsharpInheritedStructuralInterface[],
): boolean {
  const name = objectShapeStorageMemberName(shape, member);
  const valueType = member.methodValueContract ?? member.type;
  return inherited.some(parent => parent.shape.members.some(candidate => {
    if (candidate.memberKind !== "method" || !parent.methodValues && candidate.optional !== true ||
      objectShapeStorageMemberName(parent.shape, candidate) !== name) return false;
    const inheritedType = candidate.methodValueContract ?? candidate.type;
    return inheritedType !== undefined && valueType !== undefined && targetTypeRefEquals(
      member.optional === true ? csharpNullableTargetType(valueType) : valueType,
      candidate.optional === true ? csharpNullableTargetType(inheritedType) : inheritedType);
  }));
}

export function renderCsharpStructuralInterfaceMembers(typeParameterNames: ReadonlyMap<string, string> | undefined, shape: CsharpObjectShapeFact, storage: CsharpStorageClassifications, methodValues: boolean, inherited: readonly CsharpInheritedStructuralInterface[]): readonly CsharpInterfaceMember[] | undefined {
  const result: CsharpInterfaceMember[] = [];
  for (const member of shape.members) {
    if (member.memberKind === "method") {
      if (methodValues || member.optional === true) {
        const valueType = member.methodValueContract ?? member.type;
        const type = valueType === undefined ? undefined : csharpTypeFromTargetTypeRef(
          member.optional === true ? csharpNullableTargetType(valueType) : valueType, typeParameterNames);
        if (type === undefined) return undefined;
        const name = objectShapeStorageMemberName(shape, member);
        if (!csharpMethodValueHandleIsInherited(shape, member, inherited))
          result.push({ kind: "PropertyDeclaration", name, type, writable: false });
        if (member.optional === true) continue;
      }
      const signature = getCsharpDelegateSignature(member.type);
      if (signature === undefined) return undefined;
      const returnType = csharpTypeFromTargetTypeRef(signature.returnType, typeParameterNames);
      const parameters = signature.parameters.map(type => csharpTypeFromTargetTypeRef(type, typeParameterNames));
      if (returnType === undefined || parameters.some(type => type === undefined)) return undefined;
      const issues: TargetDiagnostic[] = [];
      const typeParameters: CsharpTypeParameter[] = (member.typeParameters ?? []).map(parameter => ({
        name: parameter.name, constraints: parameter.constraints.flatMap(constraint => {
          const result = csharpGenericConstraintFromTargetTypeParameterConstraint(typeParameterNames, constraint, parameter.declaration, issues);
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
      const type = csharpTypeFromTargetTypeRef(member.type, typeParameterNames);
      if (type === undefined) return undefined;
      result.push({ kind: "PropertyDeclaration", name: member.targetName, type,
        writable: member.readonly !== true && member.accessor?.setter !== false });
      const backing = storage.nativeField(shape.targetType, member.targetName);
      if (backing !== undefined) {
        const locationType = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(member.type), typeParameterNames);
        if (locationType === undefined) return undefined;
        result.push({ kind: "PropertyDeclaration", name: backing.storageName, type: locationType, writable: false });
      }
    }
  }
  const inheritedMembers: CsharpInterfaceMember[] = [];
  for (const parent of inherited) {
    const members = renderCsharpStructuralInterfaceMembers(typeParameterNames, parent.shape, storage, parent.methodValues, []);
    if (members === undefined) return undefined;
    inheritedMembers.push(...members);
  }
  return shadowCsharpInheritedInterfaceMembers(result, inheritedMembers);
}

export function shadowCsharpInheritedInterfaceMembers(
  members: readonly CsharpInterfaceMember[], inherited: readonly CsharpInterfaceMember[],
): readonly CsharpInterfaceMember[] {
  const inheritedNames = new Set(inherited.flatMap(member => member.kind === "IndexerDeclaration" ? [] : [member.name]));
  return members.map(member => member.kind !== "IndexerDeclaration" && inheritedNames.has(member.name)
    ? { ...member, modifiers: ["new", ...member.modifiers ?? []] } : member);
}
