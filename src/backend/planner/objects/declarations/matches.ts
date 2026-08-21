import type {
  CsharpClassDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeProjection,
} from "../../../../policy/types/index.js";
import {
  sameCsharpType,
} from "../../types/index.js";
import {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
  objectShapeMethodStorageTargetType,
  objectShapeStorageMemberName,
} from "../object-shape-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  renderObjectShapeTypeParameters,
} from "./type-parameters.js";
import {
  renderObjectShapeInterfaces,
} from "./interfaces.js";
import {
  csharpJsonValueInterfaceType,
  csharpJsonValueWriterMethodName,
} from "../json-object-shapes.js";
import {
  csharpObjectShapeMemberContractKey,
  csharpObjectShapeProjectionMethodName,
} from "../../../../policy/types/index.js";

export function objectShapeDeclarationMatches(
  declaration: CsharpClassDeclaration,
  fact: CsharpObjectShapeFact,
  jsonSerializable = false,
  projections: readonly CsharpObjectShapeProjection[] = [],
  receiverBoundMethodKeys: ReadonlySet<string> = new Set(),
): boolean {
  const typeParameters = renderObjectShapeTypeParameters(fact, undefined, undefined);
  if (typeParameters === undefined || !objectShapeTypeParametersMatch(declaration.typeParameters, typeParameters)) {
    return false;
  }
  const baseInterfaces = renderObjectShapeInterfaces(fact, undefined, undefined);
  const interfaces = baseInterfaces === undefined
    ? undefined
    : [
        ...baseInterfaces,
        ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
      ];
  if (interfaces === undefined || !objectShapeInterfacesMatch(declaration.interfaces, interfaces)) {
    return false;
  }
  for (const member of fact.members) {
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
        : csharpTypeFromTargetTypeRef(storageTargetType);
      if (storageType === undefined || !declaration.members.some((candidate) =>
        candidate.kind === "FieldDeclaration" &&
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
    const renderedType = csharpTypeFromTargetTypeRef(member.type);
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
      csharpObjectShapeProjectionMethodName(
        projection.kind,
        projection.resultType,
        projection.propertyOrder,
      )
    ),
  );
  if ([...projectionMethodNames].some((name) =>
    !declaration.members.some((member) =>
      member.kind === "MethodDeclaration" && member.name === name
    ))) {
    return false;
  }
  return declaration.members.every((member) => {
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
      return fact.members.some((candidate) =>
        candidate.memberKind === "method"
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
    actualParameters.every((parameter, index) => parameter.name === expected[index]?.name);
}
