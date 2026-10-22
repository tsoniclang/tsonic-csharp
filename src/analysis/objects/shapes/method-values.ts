import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpObjectShapeMethodRequiresProtocol, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  environment: CsharpTypeParameterConstraintResolver,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
): CsharpObjectShapeFact | undefined {
  const contract = shape.targetType.kind === "target-named" &&
    ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface");
  if (!contract && shape.methodImplementation === undefined) return shape;
  shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment);
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
): CsharpObjectShapeFact {
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return shape;
  const implemented = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
  const members = shape.members.map(member => {
    let contract = member.methodValueContract;
    if (contract === undefined) {
      const signature = csharpPresentObjectShapeMethod(member);
      if (signature === undefined) return member;
      // A method value is stored as its delegate (an object-literal method initializes a delegate field), so every
      // shape that holds or copies it agrees on one storage type. Only a value no delegate can carry (a generic or
      // optional method) is stored under its single-method protocol.
      if (!csharpObjectShapeMethodRequiresProtocol(member)) return member;
      const protocol = createStructuralObjectShapeTarget([signature], undefined, environment, true);
      const ownProtocol = targetTypeRefEquals(shape.targetType, protocol);
      contract = protocol;
      if (!ownProtocol) remember({ targetType: contract, members: [{ ...signature, methodValueContract: contract }] });
    }
    if (!targetTypeRefEquals(shape.targetType, contract) &&
      (member.optional !== true || csharpObjectShapeMethodDeclaration(shape, member) !== undefined)) {
      implemented.set(targetTypeRefKey(contract), contract);
    }
    return { ...member, methodValueContract: contract };
  });
  return { ...shape, members, ...(implemented.size === 0 ? {} : { implements: [...implemented.values()] }) };
}
