import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { csharpMethodValueType } from "../../../target-model/types/method-values.js";
import { createStructuralObjectShapeTarget } from "../objects/object-shape-policy/construction.js";

export function retainCsharpGenericCallableValue(
  signature: TargetTypeRef, typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>,
  remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
): TargetTypeRef | undefined {
  if (typeParameters.length === 0 || getCsharpDelegateSignature(signature) === undefined) return undefined;
  const member: CsharpObjectShapeMemberFact = Object.freeze({
    sourceKey: { kind: "property" as const, name: "Invoke" }, sourceName: "Invoke", targetName: "Invoke",
    memberKind: "method" as const, type: signature, typeParameters,
  });
  const owner = createStructuralObjectShapeTarget([member], undefined, true);
  const value = csharpMethodValueType(owner, "Invoke", "tsonic.generic-callable", signature,
    typeParameters.map(parameter => parameter.identity));
  if (value === undefined) return undefined;
  remember({ targetType: owner, members: [Object.freeze({ ...member, methodValueContract: owner })] });
  return value;
}
