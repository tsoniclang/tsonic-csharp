import { csharpObjectShapeMemberContractParts, csharpStructuralObjectShapeIdPrefix } from "../../../target-model/types/object-shape-identity.js";
import { createHash } from "node:crypto";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";

import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpTypeParameterConstraintResolutionKey } from "../../../target-model/types/generic-constraints.js";

export function selectCsharpStructuralObjectCarrier(
  canonicalMembers: readonly CsharpObjectShapeMemberFact[],
  canonicalImplemented: readonly TargetTypeRef[],
  typeParameters: readonly Extract<TargetTypeRef, { kind: "type-parameter" }>[],
  contract: boolean,
  implementation: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  const key = JSON.stringify({
    members: canonicalMembers.map(member => contract
      ? [csharpObjectShapeMemberContractParts(member), member.readonly === true]
      : csharpObjectShapeMemberContractParts(member)),
    implements: canonicalImplemented.map(targetTypeRefKey),
    ...(typeParameters.length === 0 ? {} : { parameters: typeParameters.map(parameter => [parameter.identity,
      csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints)]) }),
    ...(!contract && canonicalMembers.some(member => member.methodStorageType !== undefined) ? {
      methodStorage: canonicalMembers.map(member => member.methodStorageType === undefined ? null : targetTypeRefKey(member.methodStorageType)),
    } : {}),
    ...(contract ? { contract: true } : {}),
    ...(implementation === undefined ? {} : { implementation: implementation.identity,
      captures: implementation.captures.map(capture => [capture.fieldName, targetTypeRefKey(capture.type), capture.mutable]),
    }),
  });
  const identity = createHash("sha256").update(key).digest("hex");
  const name = `__TsonicShape_${identity}`;
  return Object.freeze(csharpTargetNamedType(`${csharpStructuralObjectShapeIdPrefix}${identity}`, typeParameters.length === 0 ? undefined : typeParameters,
    { kind: "named", name }, { generatedStructuralStorage: true, typeofRuntimeKind: "object",
      ...(contract ? { structuralContract: true } : {}), allowsRefLikeTypeArguments: typeParameters.map(() => false) }));
}

export function createCsharpObjectShapeValueStorage(
  shape: CsharpObjectShapeFact,
): CsharpObjectShapeFact | undefined {
  if (shape.targetType.kind !== "target-named" ||
    (shape.targetType as CsharpTargetNamedTypeRef).csharpGeneratedStructuralStorage !== true ||
    shape.members.length === 0 || (shape.implements?.length ?? 0) !== 0 ||
    shape.methodImplementation !== undefined || shape.members.some(member =>
      member.memberKind !== "property" || member.optional === true || member.accessor !== undefined ||
      member.bound === true || member.methodValueContract !== undefined || member.methodStorageType !== undefined)) return undefined;
  const target = shape.targetType as CsharpTargetNamedTypeRef;
  if (target.csharpRender?.kind !== "named" || target.csharpStructuralContract === true ||
    target.csharpSourceDeclarationKind !== undefined || target.csharpJsValueCarrier === true ||
    target.csharpConstraintRequiresReferenceType === true || target.csharpBaseType !== undefined ||
    target.csharpNullableReference === true || target.csharpByRefLike === true) return undefined;
  if (target.csharpValueType === true) return shape;
  const identity = createHash("sha256").update(JSON.stringify([target.id, "value-storage"])).digest("hex");
  const declarationTemplate = shape.declarationTemplate === undefined ? undefined
    : createCsharpObjectShapeValueStorage(shape.declarationTemplate);
  if (shape.declarationTemplate !== undefined && declarationTemplate === undefined) return undefined;
  return Object.freeze({
    ...shape,
    targetType: Object.freeze({ ...target, id: `${csharpStructuralObjectShapeIdPrefix}${identity}`,
      csharpRender: Object.freeze({ ...target.csharpRender, name: `__TsonicShape_${identity}` }), csharpValueType: true as const }),
    ...(declarationTemplate === undefined ? {} : { declarationTemplate }),
  });
}
