import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { csharpMethodValueType } from "../../../target-model/types/method-values.js";
import { createStructuralObjectShapeTarget } from "../../objects/shapes/construction.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";
import { formCsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";
import type { CsharpObjectShapePublisher } from "../../objects/shapes/publication.js";

export function retainCsharpGenericCallableValue(
  signature: TargetTypeRef, typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>,
  remember: CsharpObjectShapePublisher,
  environment: CsharpTypeParameterEnvironment,
): TargetTypeRef | undefined {
  if (typeParameters.length === 0 || getCsharpDelegateSignature(signature) === undefined) return undefined;
  const member: CsharpObjectShapeMemberFact = Object.freeze({
    sourceKey: { kind: "property" as const, name: "Invoke" }, sourceName: "Invoke", targetName: "Invoke",
    memberKind: "method" as const, type: signature, typeParameters,
  });
  const owner = createStructuralObjectShapeTarget([member], undefined, environment, true);
  const value = csharpMethodValueType(owner, objectShapeMethodInvocationName(member), "tsonic.generic-callable", signature,
    typeParameters.map(parameter => parameter.identity));
  if (value === undefined) return undefined;
  const shape: CsharpObjectShapeFact = Object.freeze({ targetType: owner,
    members: Object.freeze([Object.freeze({ ...member, methodValueContract: owner })]) });
  remember(formCsharpObjectShapeHeader(shape), shape);
  return value;
}
