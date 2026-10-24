import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpObjectShapeMethodRequiresProtocol, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";
export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  environment: CsharpTypeParameterConstraintResolver,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  sourceStorage: SourceStorageQueries,
): CsharpObjectShapeFact | undefined {
  const contract = shape.targetType.kind === "target-named" &&
    ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface");
  if (!contract && shape.methodImplementation === undefined) return shape;
  shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment, sourceStorage);
  const original = shape.methodImplementation === undefined ? undefined : resolveNode(shape.methodImplementation.declaration);
  const receiver = selectCsharpCopiedMethodReceiver(shape.members, original === undefined ? [shape] : [original], ast);
  if (receiver.kind === "rejected") return undefined;
  if (receiver.kind === "selected") return receiver.shape;
  const members = csharpCopiedObjectShapeMembers(shape);
  const implemented = contract ? [shape.targetType] : shape.implements;
  return rememberTargetShape({
    targetType: createStructuralObjectShapeTarget(members, implemented, environment),
    members,
    ...(implemented === undefined ? {} : { implements: implemented }),
  });
}

export function retainCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact, remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  environment: CsharpTypeParameterConstraintResolver,
  sourceStorage: SourceStorageQueries,
): CsharpObjectShapeFact {
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return shape;
  const implemented = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
  const members = shape.members.map(member => {
    const signature = csharpPresentObjectShapeMethod(member);
    if (signature === undefined) return member;
    const declaration = csharpObjectShapeMethodDeclaration(shape, member);
    const subject = declaration === undefined ? undefined : sourceStorage.memberSubjectFor(declaration);
    const writes = subject?.kind === "resolved" ? sourceStorage.memberWritesFor(subject.subject) : undefined;
    const nativeMethod = csharpObjectMethodHasFixedNativeExposure(writes);
    let contract = member.methodValueContract;
    if (contract === undefined) {
      const required = csharpObjectShapeMethodRequiresProtocol(member);
      const selfContract = shape.members.length === 1 && shape.targetType.kind === "target-named" &&
        (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true;
      if (!required && !nativeMethod && !selfContract) return declaration === undefined ? member
        : { ...member, methodValueStorage: Object.freeze({ kind: "delegate", type: member.type }) };
      const protocol = createStructuralObjectShapeTarget([signature], undefined, environment, true);
      const ownProtocol = targetTypeRefEquals(shape.targetType, protocol);
      if (!required && !nativeMethod && !ownProtocol) return declaration === undefined ? member
        : { ...member, methodValueStorage: Object.freeze({ kind: "delegate", type: member.type }) };
      contract = protocol;
      if (!ownProtocol) remember({ targetType: contract, members: [{ ...signature, methodValueContract: contract }] });
    }
    if (!targetTypeRefEquals(shape.targetType, contract) &&
      (member.optional !== true || csharpObjectShapeMethodDeclaration(shape, member) !== undefined)) {
      implemented.set(targetTypeRefKey(contract), contract);
    }
    const storage = declaration === undefined || nativeMethod ? member.methodValueStorage
      : Object.freeze({ kind: "protocol" as const, type: member.optional === true ? csharpNullableTargetType(contract) : contract,
        invocationName: objectShapeMethodInvocationName(member) });
    return { ...member, methodValueContract: contract, ...(storage === undefined ? {} : { methodValueStorage: storage }) };
  });
  return { ...shape, members, ...(implemented.size === 0 ? {} : { implements: [...implemented.values()] }) };
}
