import type {
  CsharpClassDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../../../target-ast/syntax/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../../target-model/types/index.js";
import {
  sameCsharpType,
} from "../../types/index.js";
import {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
  objectShapeStorageMemberName,
  objectShapeBoundStorageMemberName,
  csharpFrozenStorageName,
  csharpJsonValueWriterMethodName,
} from "../../../../target-model/names/object-members.js";
import { objectShapeMethodStorageTargetType, objectShapeBoundStorageTargetType } from "../object-shape-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  renderObjectShapeTypeParameters,
} from "./type-parameters.js";
import {
  renderObjectShapeInterfaces,
  csharpClosedValueCarrierInterfaceType,
} from "./interfaces.js";
import {
  csharpJsonValueInterfaceType,
} from "../json-object-shapes.js";
import {
  csharpObjectShapeMemberContractKey,
} from "../../../../target-model/types/index.js";
import { isCsharpEnumerableKeysMember } from "./enumerable-keys.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../../../target-model/records/object-shape-demand.js";
import { renderObjectShapeProjectionMethod } from "../closed-object-shapes.js";
import type { CsharpNamePlan } from "../../../../target-model/names/model.js";
import { planCsharpArtifactMemberHiding } from "../../declarations/modifiers.js";

export function objectShapeDeclarationMatches(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  names: CsharpNamePlan,
  declaration: CsharpClassDeclaration,
  fact: CsharpObjectShapeFact,
  jsonSerializable = false,
  projections: readonly CsharpObjectShapeProjectionDeclaration[] = [],
  receiverBoundMethodKeys: ReadonlySet<string> = new Set(),
  frozen = false,
  referenceIdentity = false,
  methodValueContracts: readonly CsharpTypeMember[] = [],
  enumerableKeys: readonly CsharpTypeMember[] = [],
): boolean {
  if (JSON.stringify(declaration.members.filter(isCsharpEnumerableKeysMember)) !== JSON.stringify(enumerableKeys)) return false;
  const actualContracts = declaration.members.filter(member =>
    member.kind === "PropertyDeclaration" && member.explicitInterface !== undefined);
  if (JSON.stringify(actualContracts) !== JSON.stringify(methodValueContracts)) return false;
  const typeParameters = renderObjectShapeTypeParameters(typeParameterNames, fact, undefined, undefined);
  if (typeParameters === undefined || !objectShapeTypeParametersMatch(declaration.typeParameters, typeParameters)) {
    return false;
  }
  const baseInterfaces = renderObjectShapeInterfaces(typeParameterNames, fact, undefined, undefined);
  const interfaces = baseInterfaces === undefined
    ? undefined
    : [
        ...baseInterfaces,
        ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
        ...(referenceIdentity ? [csharpClosedValueCarrierInterfaceType()] : []),
      ];
  if (interfaces === undefined || !objectShapeInterfacesMatch(declaration.interfaces, interfaces)) {
    return false;
  }
  for (const member of fact.members) {
    if (member.bound === true) {
      const storageType = csharpTypeFromTargetTypeRef(objectShapeBoundStorageTargetType(member), typeParameterNames);
      const valueType = csharpTypeFromTargetTypeRef(member.type, typeParameterNames);
      if (storageType === undefined || valueType === undefined || !declaration.members.some(candidate =>
        candidate.kind === "FieldDeclaration" && candidate.name === objectShapeBoundStorageMemberName(fact, member) &&
        sameCsharpType(candidate.type, storageType)) || !declaration.members.some(candidate =>
        candidate.kind === "PropertyDeclaration" && candidate.name === member.targetName &&
        sameCsharpType(candidate.type, valueType) && candidate.getter !== undefined &&
        (member.readonly === true ? candidate.setter === undefined : candidate.setter !== undefined))) return false;
      continue;
    }
    if (member.memberKind === "method") {
      const storageName = objectShapeStorageMemberName(fact, member);
      const storageTargetType = objectShapeMethodStorageTargetType(
        fact,
        member,
        receiverBoundMethodKeys.has(
          csharpObjectShapeMemberContractKey(member),
        ),
      );
      const storageType = storageTargetType === undefined
        ? undefined
        : csharpTypeFromTargetTypeRef(storageTargetType, typeParameterNames);
      if (storageType === undefined || !declaration.members.some((candidate) =>
        (candidate.kind === "FieldDeclaration" || frozen && candidate.kind === "PropertyDeclaration") &&
        candidate.name === storageName &&
        sameCsharpType(candidate.type, storageType)
      )) {
        return false;
      }
      if (!declaration.members.some((candidate) => candidate.kind === "MethodDeclaration" && candidate.name === member.targetName)) {
        return false;
      }
      continue;
    }
    if (member.accessor !== undefined) {
      const getterName = objectShapeAccessorGetterStorageMemberName(fact, member);
      const setterName = objectShapeAccessorSetterStorageMemberName(fact, member);
      if (!declaration.members.some((candidate) =>
        candidate.kind === "FieldDeclaration" && candidate.name === getterName
      ) || member.accessor.setter && !declaration.members.some((candidate) =>
        candidate.kind === "FieldDeclaration" && candidate.name === setterName
      ) || !declaration.members.some((candidate) =>
        candidate.kind === "PropertyDeclaration" && candidate.name === member.targetName
      )) {
        return false;
      }
      continue;
    }
    const renderedType = csharpTypeFromTargetTypeRef(member.type, typeParameterNames);
    const declarationMember = declaration.members
      .filter(isObjectShapeStorageDeclaration)
      .find((candidate) => candidate.name === member.targetName);
    if (declarationMember === undefined || renderedType === undefined || !sameCsharpType(declarationMember.type, renderedType)) {
      return false;
    }
  }
  if (jsonSerializable && !declaration.members.some((member) => member.kind === "MethodDeclaration" && member.name === csharpJsonValueWriterMethodName)) {
    return false;
  }
  const projectionMethodNames = new Set(
    projections.map((projection) =>
      projection.methodName
    ),
  );
  if (projections.some(projection => {
    const selected = renderObjectShapeProjectionMethod(typeParameterNames, projection, names);
    return selected.kind === "rejected" || !declaration.members.some(member =>
      member.kind === "MethodDeclaration" && JSON.stringify(member) === JSON.stringify(selected.method));
  })) {
    return false;
  }
  return declaration.members.every((member) => {
    if (isCsharpEnumerableKeysMember(member)) return enumerableKeys.some(expected => JSON.stringify(expected) === JSON.stringify(member));
    if (member.kind === "MethodDeclaration") {
      if (jsonSerializable && member.name === csharpJsonValueWriterMethodName) {
        return true;
      }
      if (projectionMethodNames.has(member.name)) {
        return true;
      }
      return fact.members.some((candidate) => candidate.memberKind === "method" && candidate.targetName === member.name);
    }
    if (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") {
      if (member.kind === "PropertyDeclaration" && member.explicitInterface !== undefined) return true;
      if (frozen && member.kind === "FieldDeclaration" && shapeFrozenStorageMatches(member, fact, names)) return true;
      return fact.members.some((candidate) =>
        candidate.bound === true
          ? candidate.targetName === member.name || objectShapeBoundStorageMemberName(fact, candidate) === member.name
          : candidate.memberKind === "method"
          ? objectShapeStorageMemberName(fact, candidate) === member.name
          : candidate.accessor === undefined
            ? candidate.targetName === member.name
            : candidate.targetName === member.name ||
              objectShapeAccessorGetterStorageMemberName(fact, candidate) === member.name ||
              candidate.accessor.setter &&
                objectShapeAccessorSetterStorageMemberName(fact, candidate) === member.name);
    }
    return true;
  });
}

function shapeFrozenStorageMatches(member: Extract<CsharpTypeMember, { readonly kind: "FieldDeclaration" }>, fact: CsharpObjectShapeFact, names: CsharpNamePlan): boolean {
  if (!fact.members.some(candidate => candidate.accessor === undefined &&
    member.name === csharpFrozenStorageName(fact, objectShapeStorageMemberName(fact, candidate)))) return false;
  const expectedModifiers = [...planCsharpArtifactMemberHiding(names, fact, member.name), "private"];
  return JSON.stringify(member.modifiers) === JSON.stringify(expectedModifiers);
}

function isObjectShapeStorageDeclaration(
  member: CsharpTypeMember,
): member is Extract<CsharpTypeMember, { readonly kind: "FieldDeclaration" | "PropertyDeclaration" }> {
  return member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration";
}

function objectShapeInterfacesMatch(
  actual: readonly CsharpTypeNode[] | undefined,
  expected: readonly CsharpTypeNode[],
): boolean {
  const remaining = [...(actual ?? [])];
  if (remaining.length !== expected.length) {
    return false;
  }
  for (const expectedInterface of expected) {
    const index = remaining.findIndex((actualInterface) => sameCsharpType(actualInterface, expectedInterface));
    if (index < 0) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return true;
}

function objectShapeTypeParametersMatch(
  actual: readonly CsharpTypeParameter[] | undefined,
  expected: readonly CsharpTypeParameter[],
): boolean {
  const actualParameters = actual ?? [];
  return actualParameters.length === expected.length &&
    actualParameters.every((parameter, index) => JSON.stringify(parameter) === JSON.stringify(expected[index]));
}
