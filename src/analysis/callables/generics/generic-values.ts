import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpRepresentedTypeParameter } from "../../../target-model/types/generic-constraints.js";
import { represented, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { csharpMethodValueType } from "../../../target-model/types/method-values.js";
import { createStructuralObjectShapeTarget } from "../../objects/shapes/construction.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";

export function retainCsharpGenericCallableValue(
  signature: TargetTypeRef, parameters: readonly CsharpRepresentedTypeParameter[],
  remember: (shape: CsharpObjectShapeFact, site: Node) => CsharpRepresentationOutcome<CsharpObjectShapeFact>,
  site: Node,
): CsharpRepresentationOutcome<TargetTypeRef> {
  if (parameters.length === 0 || getCsharpDelegateSignature(signature) === undefined ||
    parameters.some(parameter => parameter.csharpDeclaration === undefined)) return nativeRepresentationFailure(site,
      "CSHARP_GENERIC_CALLABLE_SIGNATURE_INCOMPLETE", "A generic callable requires its exact original binders and complete Native delegate signature.");
  const typeParameters = parameters.map(parameter => Object.freeze({ declaration: parameter.csharpDeclaration!,
    identity: parameter.identity, name: parameter.name, constraints: parameter.csharpConstraints.constraints }));
  const member: CsharpObjectShapeMemberFact = Object.freeze({
    sourceKey: { kind: "property" as const, name: "Invoke" }, sourceName: "Invoke", targetName: "Invoke",
    memberKind: "method" as const, type: signature, typeParameters,
  });
  const owner = createStructuralObjectShapeTarget([member], undefined, true);
  const value = csharpMethodValueType(owner, objectShapeMethodInvocationName(member), "tsonic.generic-callable", signature,
    typeParameters.map(parameter => parameter.identity));
  if (value === undefined) return nativeRepresentationFailure(site, "CSHARP_GENERIC_CALLABLE_PROTOCOL_INCOMPLETE",
    "The exact Native generic callable has no complete invocation protocol.");
  const retained = remember({ targetType: owner, members: [Object.freeze({ ...member, methodValueContract: owner })] }, site);
  return retained.kind === "represented" ? represented(value) : retained;
}
